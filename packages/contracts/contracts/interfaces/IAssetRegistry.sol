// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IAssetRegistry {
    function issuerOf(bytes32 assetId) external view returns (address);
    function shareTokenOf(bytes32 assetId) external view returns (address);
    function policyHashOf(bytes32 assetId) external view returns (bytes32);
    function termsHashOf(bytes32 assetId) external view returns (bytes32);
    function isActive(bytes32 assetId) external view returns (bool);
}
