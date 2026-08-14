import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, parseUnits, stringToHex } from "viem";

const { viem } = await network.create();
const ASSET_ID = keccak256(stringToHex("asset:marketplace-property"));
const POLICY_HASH = keccak256(stringToHex("policy-v1"));
const TERMS_HASH = keccak256(stringToHex("terms:marketplace-property"));

async function fixture() {
  const [admin, issuer, investor, stranger] = await viem.getWalletClients();
  assert.ok(admin.account && issuer.account && investor.account && stranger.account);
  const usdt = await viem.deployContract("MockUSDT", [], { client: { wallet: admin } });
  const registry = await viem.deployContract("AssetRegistry", [admin.account.address], { client: { wallet: admin } });
  const shares = await viem.deployContract("RevenueShareToken", ["Lekki Rental One", "vLEKKI1", admin.account.address], { client: { wallet: admin } });
  const market = await viem.deployContract("PrimaryOfferingMarketplace", [registry.address, usdt.address], { client: { wallet: admin } });
  await registry.write.registerAsset([ASSET_ID, issuer.account.address, shares.address, POLICY_HASH, TERMS_HASH]);
  await shares.write.mint([issuer.account.address, parseUnits("100", 18)]);
  await usdt.write.mint([investor.account.address, parseUnits("5000", 6)]);
  return { accounts: { admin, issuer, investor, stranger }, contracts: { usdt, registry, shares, market } };
}

describe("PrimaryOfferingMarketplace", () => {
  it("lets any wallet buy escrowed shares with TestUSDT", async () => {
    const { accounts, contracts } = await fixture();
    const issuerShares = await viem.getContractAt("RevenueShareToken", contracts.shares.address, { client: { wallet: accounts.issuer } });
    const issuerMarket = await viem.getContractAt("PrimaryOfferingMarketplace", contracts.market.address, { client: { wallet: accounts.issuer } });
    const investorUsdt = await viem.getContractAt("MockUSDT", contracts.usdt.address, { client: { wallet: accounts.investor } });
    const investorMarket = await viem.getContractAt("PrimaryOfferingMarketplace", contracts.market.address, { client: { wallet: accounts.investor } });
    await issuerShares.write.approve([contracts.market.address, parseUnits("80", 18)]);
    await issuerMarket.write.createListing([ASSET_ID, parseUnits("80", 18), parseUnits("25", 6), "ipfs://property-metadata"]);
    await investorUsdt.write.approve([contracts.market.address, parseUnits("250", 6)]);
    await investorMarket.write.buy([1n, parseUnits("10", 18), parseUnits("250", 6)]);
    assert.equal(await contracts.shares.read.balanceOf([accounts.investor.account!.address]), parseUnits("10", 18));
    assert.equal(await contracts.usdt.read.balanceOf([accounts.issuer.account!.address]), parseUnits("250", 6));
    const listing = await contracts.market.read.getListing([1n]) as { availableShares: bigint; soldShares: bigint; active: boolean };
    assert.equal(listing.availableShares, parseUnits("70", 18));
    assert.equal(listing.soldShares, parseUnits("10", 18));
  });

  it("rejects listings from wallets that do not issue the asset", async () => {
    const { accounts, contracts } = await fixture();
    const strangerMarket = await viem.getContractAt("PrimaryOfferingMarketplace", contracts.market.address, { client: { wallet: accounts.stranger } });
    await assert.rejects(strangerMarket.write.createListing([ASSET_ID, parseUnits("1", 18), 1n, ""]), /NotAssetIssuer/);
  });

  it("returns unsold inventory when the issuer cancels", async () => {
    const { accounts, contracts } = await fixture();
    const issuerShares = await viem.getContractAt("RevenueShareToken", contracts.shares.address, { client: { wallet: accounts.issuer } });
    const issuerMarket = await viem.getContractAt("PrimaryOfferingMarketplace", contracts.market.address, { client: { wallet: accounts.issuer } });
    await issuerShares.write.approve([contracts.market.address, parseUnits("30", 18)]);
    await issuerMarket.write.createListing([ASSET_ID, parseUnits("30", 18), parseUnits("10", 6), ""]);
    await issuerMarket.write.cancelListing([1n]);
    assert.equal(await contracts.shares.read.balanceOf([accounts.issuer.account!.address]), parseUnits("100", 18));
    const listing = await contracts.market.read.getListing([1n]) as { active: boolean };
    assert.equal(listing.active, false);
  });
});
