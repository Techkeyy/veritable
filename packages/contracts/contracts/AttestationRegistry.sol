// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IAssetRegistry} from "./interfaces/IAssetRegistry.sol";
import {IYieldVault} from "./interfaces/IYieldVault.sol";
import {VerifierStaking} from "./VerifierStaking.sol";

contract AttestationRegistry is AccessControl, EIP712, Pausable, ReentrancyGuard {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(bytes32 claimId,bytes32 assetId,bytes32 periodKey,uint256 claimedAmount,uint256 verifiedAmount,uint8 outcome,bytes32 evidenceRoot,bytes32 reportHash,bytes32 policyHash,bytes32 termsHash,bytes32 modelRunHash,uint256 nonce,uint256 deadline)"
    );

    enum Outcome {
        INCONCLUSIVE,
        VERIFIED,
        BLOCKED
    }

    enum Status {
        NONE,
        PENDING,
        CHALLENGED,
        SETTLED
    }

    struct AttestationData {
        bytes32 claimId;
        bytes32 assetId;
        bytes32 periodKey;
        uint256 claimedAmount;
        uint256 verifiedAmount;
        Outcome outcome;
        bytes32 evidenceRoot;
        bytes32 reportHash;
        bytes32 policyHash;
        bytes32 termsHash;
        bytes32 modelRunHash;
        uint256 nonce;
        uint256 deadline;
    }

    struct Attestation {
        AttestationData data;
        address verifier;
        address challenger;
        bytes32 counterEvidenceRoot;
        uint64 challengeDeadline;
        Status status;
    }

    IYieldVault public immutable yieldVault;
    IAssetRegistry public immutable assetRegistry;
    VerifierStaking public immutable staking;
    address public immutable treasury;
    uint256 public immutable verifierBond;
    uint256 public immutable challengerBond;
    uint64 public immutable challengeWindow;

    mapping(bytes32 attestationId => Attestation attestation) private attestations;
    mapping(bytes32 claimId => bytes32 attestationId) public claimAttestations;
    mapping(address verifier => uint256 nextNonce) public nonces;

    error ZeroAddress();
    error InvalidOutcome();
    error InvalidVerifiedAmount();
    error SignatureExpired(uint256 deadline);
    error InvalidNonce(uint256 provided, uint256 expected);
    error ClaimMismatch();
    error PolicyMismatch(bytes32 registeredPolicyHash, bytes32 attestedPolicyHash);
    error TermsMismatch(bytes32 registeredTermsHash, bytes32 attestedTermsHash);
    error ClaimNotSubmitted(bytes32 claimId);
    error ClaimAlreadyAttested(bytes32 claimId);
    error InvalidVerifier(address verifier);
    error InvalidChallengeBond(uint256 provided, uint256 required);
    error AttestationNotPending(bytes32 attestationId);
    error ChallengeWindowClosed(uint64 deadline);
    error ChallengeWindowOpen(uint64 deadline);
    error AttestationNotChallenged(bytes32 attestationId);
    error NativeTransferFailed();

    event AttestationSubmitted(
        bytes32 indexed attestationId,
        bytes32 indexed claimId,
        address indexed verifier,
        Outcome outcome,
        uint256 verifiedAmount,
        uint64 challengeDeadline,
        bytes32 reportHash
    );
    event AttestationChallenged(
        bytes32 indexed attestationId,
        address indexed challenger,
        bytes32 counterEvidenceRoot
    );
    event AttestationSettled(
        bytes32 indexed attestationId,
        Outcome finalOutcome,
        uint256 finalVerifiedAmount,
        bool verifierUpheld
    );

    constructor(
        address admin,
        IYieldVault yieldVault_,
        IAssetRegistry assetRegistry_,
        VerifierStaking staking_,
        address treasury_,
        uint256 verifierBond_,
        uint256 challengerBond_,
        uint64 challengeWindow_
    ) EIP712(block.chainid == 968 ? "VeriFi Attestation Registry" : "Veritable Attestation Registry", "1") {
        if (
            admin == address(0) || address(yieldVault_) == address(0)
                || address(assetRegistry_) == address(0)
                || address(staking_) == address(0) || treasury_ == address(0)
        ) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RESOLVER_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
        yieldVault = yieldVault_;
        assetRegistry = assetRegistry_;
        staking = staking_;
        treasury = treasury_;
        verifierBond = verifierBond_;
        challengerBond = challengerBond_;
        challengeWindow = challengeWindow_;
    }

    function submitAttestation(AttestationData calldata data, bytes calldata signature)
        external
        whenNotPaused
        returns (bytes32 attestationId)
    {
        if (data.outcome == Outcome.INCONCLUSIVE) revert InvalidOutcome();
        if (
            (data.outcome == Outcome.VERIFIED && data.verifiedAmount == 0)
                || (data.outcome == Outcome.BLOCKED && data.verifiedAmount != 0)
        ) revert InvalidVerifiedAmount();
        if (block.timestamp > data.deadline) revert SignatureExpired(data.deadline);

        bytes32 structHash = keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                data.claimId,
                data.assetId,
                data.periodKey,
                data.claimedAmount,
                data.verifiedAmount,
                data.outcome,
                data.evidenceRoot,
                data.reportHash,
                data.policyHash,
                data.termsHash,
                data.modelRunHash,
                data.nonce,
                data.deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address verifier = ECDSA.recover(digest, signature);
        if (!hasRole(VERIFIER_ROLE, verifier)) revert InvalidVerifier(verifier);
        uint256 expectedNonce = nonces[verifier];
        if (data.nonce != expectedNonce) revert InvalidNonce(data.nonce, expectedNonce);
        if (claimAttestations[data.claimId] != bytes32(0)) revert ClaimAlreadyAttested(data.claimId);

        (
            bytes32 claimAssetId,
            bytes32 claimPeriodKey,
            uint256 escrowedAmount,
            bytes32 claimEvidenceRoot,
            uint8 claimStatus
        ) = yieldVault.claimForAttestation(data.claimId);
        if (claimStatus != 1) revert ClaimNotSubmitted(data.claimId);
        if (
            claimAssetId != data.assetId || claimPeriodKey != data.periodKey
                || escrowedAmount != data.claimedAmount || claimEvidenceRoot != data.evidenceRoot
        ) revert ClaimMismatch();
        bytes32 registeredPolicyHash = assetRegistry.policyHashOf(data.assetId);
        if (registeredPolicyHash != data.policyHash) {
            revert PolicyMismatch(registeredPolicyHash, data.policyHash);
        }
        bytes32 registeredTermsHash = assetRegistry.termsHashOf(data.assetId);
        if (registeredTermsHash != data.termsHash) {
            revert TermsMismatch(registeredTermsHash, data.termsHash);
        }
        if (data.outcome == Outcome.VERIFIED && data.verifiedAmount != escrowedAmount) {
            revert InvalidVerifiedAmount();
        }

        nonces[verifier] = expectedNonce + 1;
        attestationId = digest;
        uint64 challengeDeadline = uint64(block.timestamp) + challengeWindow;
        attestations[attestationId] = Attestation({
            data: data,
            verifier: verifier,
            challenger: address(0),
            counterEvidenceRoot: bytes32(0),
            challengeDeadline: challengeDeadline,
            status: Status.PENDING
        });
        claimAttestations[data.claimId] = attestationId;
        staking.lockStake(verifier, attestationId, verifierBond);
        emit AttestationSubmitted(
            attestationId,
            data.claimId,
            verifier,
            data.outcome,
            data.verifiedAmount,
            challengeDeadline,
            data.reportHash
        );
    }

    function challenge(bytes32 attestationId, bytes32 counterEvidenceRoot)
        external
        payable
        whenNotPaused
    {
        Attestation storage attestation = attestations[attestationId];
        if (attestation.status != Status.PENDING) revert AttestationNotPending(attestationId);
        if (block.timestamp >= attestation.challengeDeadline) {
            revert ChallengeWindowClosed(attestation.challengeDeadline);
        }
        if (msg.value != challengerBond) revert InvalidChallengeBond(msg.value, challengerBond);
        attestation.challenger = msg.sender;
        attestation.counterEvidenceRoot = counterEvidenceRoot;
        attestation.status = Status.CHALLENGED;
        emit AttestationChallenged(attestationId, msg.sender, counterEvidenceRoot);
    }

    function settle(bytes32 attestationId) external nonReentrant {
        Attestation storage attestation = attestations[attestationId];
        if (attestation.status != Status.PENDING) revert AttestationNotPending(attestationId);
        if (block.timestamp < attestation.challengeDeadline) {
            revert ChallengeWindowOpen(attestation.challengeDeadline);
        }
        attestation.status = Status.SETTLED;
        staking.unlockStake(attestationId);
        _applyOutcome(attestation.data.claimId, attestation.data.outcome, attestation.data.verifiedAmount);
        emit AttestationSettled(
            attestationId, attestation.data.outcome, attestation.data.verifiedAmount, true
        );
    }

    function resolve(
        bytes32 attestationId,
        bool verifierUpheld,
        Outcome finalOutcome,
        uint256 finalVerifiedAmount
    ) external onlyRole(RESOLVER_ROLE) nonReentrant {
        Attestation storage attestation = attestations[attestationId];
        if (attestation.status != Status.CHALLENGED) revert AttestationNotChallenged(attestationId);
        if (finalOutcome == Outcome.INCONCLUSIVE) revert InvalidOutcome();
        if (
            (finalOutcome == Outcome.VERIFIED && finalVerifiedAmount == 0)
                || (finalOutcome == Outcome.BLOCKED && finalVerifiedAmount != 0)
                || (
                    finalOutcome == Outcome.VERIFIED
                        && finalVerifiedAmount != attestation.data.claimedAmount
                )
        ) revert InvalidVerifiedAmount();
        if (
            verifierUpheld
                && (
                    finalOutcome != attestation.data.outcome
                        || finalVerifiedAmount != attestation.data.verifiedAmount
                )
        ) revert ClaimMismatch();

        attestation.status = Status.SETTLED;
        if (verifierUpheld) {
            staking.unlockStake(attestationId);
            uint256 verifierReward = (challengerBond * 80) / 100;
            uint256 treasuryReward = challengerBond - verifierReward;
            (bool verifierSuccess,) = payable(attestation.verifier).call{value: verifierReward}("");
            (bool treasurySuccess,) = payable(treasury).call{value: treasuryReward}("");
            if (!verifierSuccess || !treasurySuccess) revert NativeTransferFailed();
        } else {
            staking.slashStake(attestationId, attestation.challenger, treasury);
            (bool returned,) = payable(attestation.challenger).call{value: challengerBond}("");
            if (!returned) revert NativeTransferFailed();
        }
        _applyOutcome(attestation.data.claimId, finalOutcome, finalVerifiedAmount);
        emit AttestationSettled(attestationId, finalOutcome, finalVerifiedAmount, verifierUpheld);
    }

    function _applyOutcome(bytes32 claimId, Outcome outcome, uint256 verifiedAmount) private {
        if (outcome == Outcome.VERIFIED) {
            yieldVault.activateRelease(claimId, verifiedAmount);
        } else {
            yieldVault.blockClaim(claimId);
        }
    }

    function getAttestation(bytes32 attestationId) external view returns (Attestation memory) {
        return attestations[attestationId];
    }

    function hashAttestation(AttestationData calldata data) external view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    data.claimId,
                    data.assetId,
                    data.periodKey,
                    data.claimedAmount,
                    data.verifiedAmount,
                    data.outcome,
                    data.evidenceRoot,
                    data.reportHash,
                    data.policyHash,
                    data.termsHash,
                    data.modelRunHash,
                    data.nonce,
                    data.deadline
                )
            )
        );
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(GUARDIAN_ROLE) {
        _unpause();
    }
}
