// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAssetRegistry} from "./interfaces/IAssetRegistry.sol";

contract AssetRegistry is AccessControl, IAssetRegistry {
    bytes32 public constant ASSET_MANAGER_ROLE = keccak256("ASSET_MANAGER_ROLE");

    struct Asset {
        address issuer;
        address shareToken;
        bytes32 policyHash;
        bytes32 termsHash;
        bool active;
    }

    mapping(bytes32 assetId => Asset asset) private assets;

    error AssetAlreadyExists(bytes32 assetId);
    error AssetNotFound(bytes32 assetId);
    error ZeroAddress();

    event AssetRegistered(
        bytes32 indexed assetId,
        address indexed issuer,
        address indexed shareToken,
        bytes32 policyHash,
        bytes32 termsHash
    );
    event AssetStatusChanged(bytes32 indexed assetId, bool active);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ASSET_MANAGER_ROLE, admin);
    }

    function registerAsset(
        bytes32 assetId,
        address issuer,
        address shareToken,
        bytes32 policyHash,
        bytes32 termsHash
    ) external onlyRole(ASSET_MANAGER_ROLE) {
        if (issuer == address(0) || shareToken == address(0)) revert ZeroAddress();
        if (assets[assetId].issuer != address(0)) revert AssetAlreadyExists(assetId);
        assets[assetId] = Asset({
            issuer: issuer,
            shareToken: shareToken,
            policyHash: policyHash,
            termsHash: termsHash,
            active: true
        });
        emit AssetRegistered(assetId, issuer, shareToken, policyHash, termsHash);
    }

    function setAssetActive(bytes32 assetId, bool active) external onlyRole(ASSET_MANAGER_ROLE) {
        if (assets[assetId].issuer == address(0)) revert AssetNotFound(assetId);
        assets[assetId].active = active;
        emit AssetStatusChanged(assetId, active);
    }

    function issuerOf(bytes32 assetId) external view returns (address) {
        return assets[assetId].issuer;
    }

    function shareTokenOf(bytes32 assetId) external view returns (address) {
        return assets[assetId].shareToken;
    }

    function policyHashOf(bytes32 assetId) external view returns (bytes32) {
        return assets[assetId].policyHash;
    }

    function termsHashOf(bytes32 assetId) external view returns (bytes32) {
        return assets[assetId].termsHash;
    }

    function isActive(bytes32 assetId) external view returns (bool) {
        return assets[assetId].active;
    }
}
