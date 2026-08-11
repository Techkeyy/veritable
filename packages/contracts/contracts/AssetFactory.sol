// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AssetRegistry} from "./AssetRegistry.sol";
import {RevenueShareToken} from "./RevenueShareToken.sol";

contract AssetFactory {
    uint256 public constant MAX_INITIAL_HOLDERS = 20;

    AssetRegistry public immutable assetRegistry;
    address public immutable yieldVault;

    error ZeroAddress();
    error InvalidAllocationCount();
    error InvalidAllocation(uint256 index);

    event AssetCreated(
        bytes32 indexed assetId,
        address indexed issuer,
        address indexed shareToken,
        bytes32 policyHash,
        bytes32 termsHash
    );

    constructor(AssetRegistry assetRegistry_, address yieldVault_) {
        if (address(assetRegistry_) == address(0) || yieldVault_ == address(0)) {
            revert ZeroAddress();
        }
        assetRegistry = assetRegistry_;
        yieldVault = yieldVault_;
    }

    function createAsset(
        bytes32 assetId,
        string calldata name,
        string calldata symbol,
        bytes32 policyHash,
        bytes32 termsHash,
        address[] calldata holders,
        uint256[] calldata shares
    ) external returns (address shareToken) {
        if (
            holders.length == 0 || holders.length != shares.length
                || holders.length > MAX_INITIAL_HOLDERS
        ) revert InvalidAllocationCount();

        RevenueShareToken token = new RevenueShareToken(name, symbol, address(this));
        bytes32 adminRole = token.DEFAULT_ADMIN_ROLE();
        bytes32 minterRole = token.MINTER_ROLE();
        token.grantRole(adminRole, msg.sender);
        token.grantRole(minterRole, msg.sender);
        token.grantRole(token.SNAPSHOT_ROLE(), yieldVault);

        for (uint256 index = 0; index < holders.length; ++index) {
            if (holders[index] == address(0) || shares[index] == 0) {
                revert InvalidAllocation(index);
            }
            token.mint(holders[index], shares[index]);
        }

        token.renounceRole(minterRole, address(this));
        token.renounceRole(adminRole, address(this));
        assetRegistry.registerAsset(assetId, msg.sender, address(token), policyHash, termsHash);
        shareToken = address(token);
        emit AssetCreated(assetId, msg.sender, shareToken, policyHash, termsHash);
    }
}
