// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IAssetRegistry} from "./interfaces/IAssetRegistry.sol";

/// @notice Testnet primary issuance for registered Veritable revenue-share assets.
/// @dev This is not an order book or secondary market. Issuers escrow existing
/// share tokens and buyers acquire them at a fixed USDT price.
contract PrimaryOfferingMarketplace is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant SHARE_UNIT = 1e18;

    struct Listing {
        bytes32 assetId;
        address issuer;
        address shareToken;
        uint256 pricePerShareMinor;
        uint256 availableShares;
        uint256 soldShares;
        string metadataURI;
        bool active;
    }

    IAssetRegistry public immutable assetRegistry;
    IERC20 public immutable settlementToken;
    uint256 public listingCount;
    mapping(uint256 listingId => Listing listing) private listings;

    error ZeroAddress();
    error InvalidListing();
    error InvalidAmount();
    error AssetInactive();
    error NotAssetIssuer();
    error NotListingIssuer();
    error ListingInactive();
    error InsufficientInventory();
    error CostExceedsMaximum(uint256 cost, uint256 maximum);
    error UnsupportedShareDecimals(uint8 decimals);

    event ListingCreated(
        uint256 indexed listingId,
        bytes32 indexed assetId,
        address indexed issuer,
        address shareToken,
        uint256 pricePerShareMinor,
        uint256 availableShares,
        string metadataURI
    );
    event SharesPurchased(
        uint256 indexed listingId,
        address indexed buyer,
        uint256 shareAmount,
        uint256 costMinor
    );
    event ListingCancelled(uint256 indexed listingId, uint256 returnedShares);

    constructor(IAssetRegistry assetRegistry_, IERC20 settlementToken_) {
        if (address(assetRegistry_) == address(0) || address(settlementToken_) == address(0)) {
            revert ZeroAddress();
        }
        assetRegistry = assetRegistry_;
        settlementToken = settlementToken_;
    }

    function createListing(
        bytes32 assetId,
        uint256 shareAmount,
        uint256 pricePerShareMinor,
        string calldata metadataURI
    ) external nonReentrant returns (uint256 listingId) {
        if (shareAmount == 0 || pricePerShareMinor == 0) revert InvalidAmount();
        if (!assetRegistry.isActive(assetId)) revert AssetInactive();
        if (assetRegistry.issuerOf(assetId) != msg.sender) revert NotAssetIssuer();
        address shareToken = assetRegistry.shareTokenOf(assetId);
        if (shareToken == address(0)) revert InvalidListing();
        uint8 decimals = IERC20Metadata(shareToken).decimals();
        if (decimals != 18) revert UnsupportedShareDecimals(decimals);

        listingId = ++listingCount;
        listings[listingId] = Listing({
            assetId: assetId,
            issuer: msg.sender,
            shareToken: shareToken,
            pricePerShareMinor: pricePerShareMinor,
            availableShares: shareAmount,
            soldShares: 0,
            metadataURI: metadataURI,
            active: true
        });
        IERC20(shareToken).safeTransferFrom(msg.sender, address(this), shareAmount);
        emit ListingCreated(
            listingId,
            assetId,
            msg.sender,
            shareToken,
            pricePerShareMinor,
            shareAmount,
            metadataURI
        );
    }

    function buy(uint256 listingId, uint256 shareAmount, uint256 maxCostMinor)
        external
        nonReentrant
        returns (uint256 costMinor)
    {
        Listing storage listing = listings[listingId];
        if (listing.issuer == address(0)) revert InvalidListing();
        if (!listing.active) revert ListingInactive();
        if (!assetRegistry.isActive(listing.assetId)) revert AssetInactive();
        if (shareAmount == 0) revert InvalidAmount();
        if (shareAmount > listing.availableShares) revert InsufficientInventory();

        costMinor = Math.mulDiv(
            shareAmount,
            listing.pricePerShareMinor,
            SHARE_UNIT,
            Math.Rounding.Up
        );
        if (costMinor > maxCostMinor) revert CostExceedsMaximum(costMinor, maxCostMinor);

        listing.availableShares -= shareAmount;
        listing.soldShares += shareAmount;
        if (listing.availableShares == 0) listing.active = false;

        settlementToken.safeTransferFrom(msg.sender, listing.issuer, costMinor);
        IERC20(listing.shareToken).safeTransfer(msg.sender, shareAmount);
        emit SharesPurchased(listingId, msg.sender, shareAmount, costMinor);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        if (listing.issuer == address(0)) revert InvalidListing();
        if (listing.issuer != msg.sender) revert NotListingIssuer();
        if (!listing.active) revert ListingInactive();
        uint256 remaining = listing.availableShares;
        listing.availableShares = 0;
        listing.active = false;
        IERC20(listing.shareToken).safeTransfer(msg.sender, remaining);
        emit ListingCancelled(listingId, remaining);
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        Listing memory listing = listings[listingId];
        if (listing.issuer == address(0)) revert InvalidListing();
        return listing;
    }
}
