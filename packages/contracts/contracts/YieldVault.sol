// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAssetRegistry} from "./interfaces/IAssetRegistry.sol";
import {IRevenueShareToken} from "./interfaces/IRevenueShareToken.sol";
import {IYieldVault} from "./interfaces/IYieldVault.sol";

contract YieldVault is AccessControl, Pausable, ReentrancyGuard, IYieldVault {
    using SafeERC20 for IERC20;

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant ATTESTATION_REGISTRY_ROLE = keccak256("ATTESTATION_REGISTRY_ROLE");

    enum ClaimStatus {
        NONE,
        SUBMITTED,
        RELEASED,
        BLOCKED,
        REFUNDED
    }

    struct Claim {
        bytes32 assetId;
        bytes32 periodKey;
        bytes32 evidenceRoot;
        address issuer;
        address shareToken;
        uint256 escrowedAmount;
        uint256 verifiedAmount;
        uint256 snapshotId;
        uint256 totalShares;
        uint64 resolvedAt;
        ClaimStatus status;
    }

    IERC20 public immutable settlementToken;
    IAssetRegistry public immutable assetRegistry;
    uint64 public immutable blockedRefundDelay;
    mapping(bytes32 claimId => Claim claim) private claims;
    mapping(bytes32 assetId => mapping(bytes32 periodKey => bytes32 claimId)) public periodClaims;
    mapping(bytes32 claimId => mapping(address holder => bool claimed)) public hasClaimed;
    mapping(bytes32 claimId => uint256 amount) public totalClaimed;

    error ZeroAddress();
    error InvalidAmount();
    error AssetInactive(bytes32 assetId);
    error NotAssetIssuer(address caller);
    error PeriodAlreadyClaimed(bytes32 assetId, bytes32 periodKey);
    error ClaimNotSubmitted(bytes32 claimId);
    error ClaimNotReleased(bytes32 claimId);
    error ClaimNotBlocked(bytes32 claimId);
    error AlreadyClaimed(bytes32 claimId, address holder);
    error NoEntitlement(bytes32 claimId, address holder);
    error VerifiedAmountMismatch(uint256 verifiedAmount, uint256 escrowedAmount);
    error NoShareSupply();
    error RefundNotReady(uint256 availableAt);

    event YieldClaimSubmitted(
        bytes32 indexed claimId,
        bytes32 indexed assetId,
        bytes32 indexed periodKey,
        address issuer,
        uint256 amount,
        bytes32 evidenceRoot,
        uint256 snapshotId
    );
    event YieldReleaseActivated(bytes32 indexed claimId, uint256 verifiedAmount);
    event YieldClaimBlocked(bytes32 indexed claimId);
    event YieldClaimed(bytes32 indexed claimId, address indexed holder, uint256 amount);
    event BlockedClaimRefunded(bytes32 indexed claimId, address indexed issuer, uint256 amount);

    constructor(
        address admin,
        IERC20 settlementToken_,
        IAssetRegistry assetRegistry_,
        uint64 blockedRefundDelay_
    ) {
        if (
            admin == address(0) || address(settlementToken_) == address(0)
                || address(assetRegistry_) == address(0)
        ) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
        settlementToken = settlementToken_;
        assetRegistry = assetRegistry_;
        blockedRefundDelay = blockedRefundDelay_;
    }

    function submitClaim(bytes32 assetId, bytes32 periodKey, uint256 amount, bytes32 evidenceRoot)
        external
        whenNotPaused
        nonReentrant
        returns (bytes32 claimId)
    {
        if (amount == 0) revert InvalidAmount();
        if (!assetRegistry.isActive(assetId)) revert AssetInactive(assetId);
        address issuer = assetRegistry.issuerOf(assetId);
        if (msg.sender != issuer) revert NotAssetIssuer(msg.sender);
        if (periodClaims[assetId][periodKey] != bytes32(0)) {
            revert PeriodAlreadyClaimed(assetId, periodKey);
        }

        address shareToken = assetRegistry.shareTokenOf(assetId);
        uint256 snapshotId = IRevenueShareToken(shareToken).snapshot();
        uint256 totalShares = IRevenueShareToken(shareToken).totalSupplyAt(snapshotId);
        if (totalShares == 0) revert NoShareSupply();

        claimId = keccak256(abi.encode(block.chainid, address(this), assetId, periodKey));
        periodClaims[assetId][periodKey] = claimId;
        claims[claimId] = Claim({
            assetId: assetId,
            periodKey: periodKey,
            evidenceRoot: evidenceRoot,
            issuer: issuer,
            shareToken: shareToken,
            escrowedAmount: amount,
            verifiedAmount: 0,
            snapshotId: snapshotId,
            totalShares: totalShares,
            resolvedAt: 0,
            status: ClaimStatus.SUBMITTED
        });
        settlementToken.safeTransferFrom(msg.sender, address(this), amount);
        emit YieldClaimSubmitted(
            claimId, assetId, periodKey, issuer, amount, evidenceRoot, snapshotId
        );
    }

    function activateRelease(bytes32 claimId, uint256 verifiedAmount)
        external
        onlyRole(ATTESTATION_REGISTRY_ROLE)
    {
        Claim storage claim = claims[claimId];
        if (claim.status != ClaimStatus.SUBMITTED) revert ClaimNotSubmitted(claimId);
        if (verifiedAmount != claim.escrowedAmount) {
            revert VerifiedAmountMismatch(verifiedAmount, claim.escrowedAmount);
        }
        claim.verifiedAmount = verifiedAmount;
        claim.resolvedAt = uint64(block.timestamp);
        claim.status = ClaimStatus.RELEASED;
        emit YieldReleaseActivated(claimId, verifiedAmount);
    }

    function blockClaim(bytes32 claimId) external onlyRole(ATTESTATION_REGISTRY_ROLE) {
        Claim storage claim = claims[claimId];
        if (claim.status != ClaimStatus.SUBMITTED) revert ClaimNotSubmitted(claimId);
        claim.resolvedAt = uint64(block.timestamp);
        claim.status = ClaimStatus.BLOCKED;
        emit YieldClaimBlocked(claimId);
    }

    function claimYield(bytes32 claimId) external nonReentrant {
        Claim storage claim = claims[claimId];
        if (claim.status != ClaimStatus.RELEASED) revert ClaimNotReleased(claimId);
        if (hasClaimed[claimId][msg.sender]) revert AlreadyClaimed(claimId, msg.sender);
        uint256 shares = IRevenueShareToken(claim.shareToken).balanceOfAt(msg.sender, claim.snapshotId);
        uint256 entitlement = (claim.verifiedAmount * shares) / claim.totalShares;
        if (entitlement == 0) revert NoEntitlement(claimId, msg.sender);
        hasClaimed[claimId][msg.sender] = true;
        totalClaimed[claimId] += entitlement;
        settlementToken.safeTransfer(msg.sender, entitlement);
        emit YieldClaimed(claimId, msg.sender, entitlement);
    }

    function refundBlockedClaim(bytes32 claimId) external nonReentrant {
        Claim storage claim = claims[claimId];
        if (claim.status != ClaimStatus.BLOCKED) revert ClaimNotBlocked(claimId);
        if (msg.sender != claim.issuer) revert NotAssetIssuer(msg.sender);
        uint256 availableAt = uint256(claim.resolvedAt) + blockedRefundDelay;
        if (block.timestamp < availableAt) revert RefundNotReady(availableAt);
        claim.status = ClaimStatus.REFUNDED;
        settlementToken.safeTransfer(claim.issuer, claim.escrowedAmount);
        emit BlockedClaimRefunded(claimId, claim.issuer, claim.escrowedAmount);
    }

    function claimForAttestation(bytes32 claimId)
        external
        view
        returns (
            bytes32 assetId,
            bytes32 periodKey,
            uint256 escrowedAmount,
            bytes32 evidenceRoot,
            uint8 status
        )
    {
        Claim storage claim = claims[claimId];
        return (
            claim.assetId,
            claim.periodKey,
            claim.escrowedAmount,
            claim.evidenceRoot,
            uint8(claim.status)
        );
    }

    function getClaim(bytes32 claimId) external view returns (Claim memory) {
        return claims[claimId];
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(GUARDIAN_ROLE) {
        _unpause();
    }
}
