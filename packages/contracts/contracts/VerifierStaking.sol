// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract VerifierStaking is AccessControl, ReentrancyGuard {
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");

    struct StakeLock {
        address verifier;
        uint256 amount;
        bool active;
    }

    struct UnstakeRequest {
        uint256 amount;
        uint64 availableAt;
    }

    uint64 public immutable unstakeCooldown;
    mapping(address verifier => uint256 amount) public freeStake;
    mapping(address verifier => uint256 amount) public lockedStake;
    mapping(bytes32 attestationId => StakeLock stakeLock) public stakeLocks;
    mapping(address verifier => UnstakeRequest request) public unstakeRequests;

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientFreeStake(uint256 available, uint256 required);
    error LockAlreadyExists(bytes32 attestationId);
    error LockNotActive(bytes32 attestationId);
    error UnstakeNotReady(uint64 availableAt);
    error NativeTransferFailed();

    event Staked(address indexed verifier, uint256 amount);
    event StakeLocked(bytes32 indexed attestationId, address indexed verifier, uint256 amount);
    event StakeUnlocked(bytes32 indexed attestationId, address indexed verifier, uint256 amount);
    event StakeSlashed(
        bytes32 indexed attestationId,
        address indexed verifier,
        address indexed challenger,
        uint256 challengerReward,
        uint256 treasuryReward
    );
    event UnstakeRequested(address indexed verifier, uint256 amount, uint64 availableAt);
    event Unstaked(address indexed verifier, uint256 amount);

    constructor(address admin, uint64 unstakeCooldown_) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        unstakeCooldown = unstakeCooldown_;
    }

    function stake() external payable {
        if (msg.value == 0) revert ZeroAmount();
        freeStake[msg.sender] += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    function requestUnstake(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        uint256 available = freeStake[msg.sender];
        if (available < amount) revert InsufficientFreeStake(available, amount);
        freeStake[msg.sender] = available - amount;
        uint64 availableAt = uint64(block.timestamp) + unstakeCooldown;
        unstakeRequests[msg.sender] = UnstakeRequest({amount: amount, availableAt: availableAt});
        emit UnstakeRequested(msg.sender, amount, availableAt);
    }

    function withdrawUnstaked() external nonReentrant {
        UnstakeRequest memory request = unstakeRequests[msg.sender];
        if (request.amount == 0 || block.timestamp < request.availableAt) {
            revert UnstakeNotReady(request.availableAt);
        }
        delete unstakeRequests[msg.sender];
        (bool success,) = payable(msg.sender).call{value: request.amount}("");
        if (!success) revert NativeTransferFailed();
        emit Unstaked(msg.sender, request.amount);
    }

    function lockStake(address verifier, bytes32 attestationId, uint256 amount)
        external
        onlyRole(REGISTRY_ROLE)
    {
        if (stakeLocks[attestationId].active) revert LockAlreadyExists(attestationId);
        uint256 available = freeStake[verifier];
        if (available < amount) revert InsufficientFreeStake(available, amount);
        freeStake[verifier] = available - amount;
        lockedStake[verifier] += amount;
        stakeLocks[attestationId] = StakeLock({verifier: verifier, amount: amount, active: true});
        emit StakeLocked(attestationId, verifier, amount);
    }

    function unlockStake(bytes32 attestationId) external onlyRole(REGISTRY_ROLE) {
        StakeLock storage stakeLock = stakeLocks[attestationId];
        if (!stakeLock.active) revert LockNotActive(attestationId);
        stakeLock.active = false;
        lockedStake[stakeLock.verifier] -= stakeLock.amount;
        freeStake[stakeLock.verifier] += stakeLock.amount;
        emit StakeUnlocked(attestationId, stakeLock.verifier, stakeLock.amount);
    }

    function slashStake(bytes32 attestationId, address challenger, address treasury)
        external
        onlyRole(REGISTRY_ROLE)
        nonReentrant
    {
        if (challenger == address(0) || treasury == address(0)) revert ZeroAddress();
        StakeLock storage stakeLock = stakeLocks[attestationId];
        if (!stakeLock.active) revert LockNotActive(attestationId);
        stakeLock.active = false;
        lockedStake[stakeLock.verifier] -= stakeLock.amount;
        uint256 challengerReward = (stakeLock.amount * 80) / 100;
        uint256 treasuryReward = stakeLock.amount - challengerReward;
        (bool challengerSuccess,) = payable(challenger).call{value: challengerReward}("");
        (bool treasurySuccess,) = payable(treasury).call{value: treasuryReward}("");
        if (!challengerSuccess || !treasurySuccess) revert NativeTransferFailed();
        emit StakeSlashed(
            attestationId,
            stakeLock.verifier,
            challenger,
            challengerReward,
            treasuryReward
        );
    }
}
