// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IYieldVault {
    function claimForAttestation(bytes32 claimId)
        external
        view
        returns (
            bytes32 assetId,
            bytes32 periodKey,
            uint256 escrowedAmount,
            bytes32 evidenceRoot,
            uint8 status
        );

    function activateRelease(bytes32 claimId, uint256 verifiedAmount) external;
    function blockClaim(bytes32 claimId) external;
}
