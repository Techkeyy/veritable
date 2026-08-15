export const erc20Abi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const assetRegistryAbi = [
  {
    type: "function",
    name: "shareTokenOf",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "bytes32" }],
    outputs: [{ name: "shareToken", type: "address" }],
  },
  {
    type: "function",
    name: "termsHashOf",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "bytes32" }],
    outputs: [{ type: "bytes32" }],
  },
] as const;

export const marketplaceAbi = [
  {
    type: "function",
    name: "listingCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getListing",
    stateMutability: "view",
    inputs: [{ name: "listingId", type: "uint256" }],
    outputs: [{
      name: "listing",
      type: "tuple",
      components: [
        { name: "assetId", type: "bytes32" },
        { name: "issuer", type: "address" },
        { name: "shareToken", type: "address" },
        { name: "pricePerShareMinor", type: "uint256" },
        { name: "availableShares", type: "uint256" },
        { name: "soldShares", type: "uint256" },
        { name: "metadataURI", type: "string" },
        { name: "active", type: "bool" },
      ],
    }],
  },
  {
    type: "function",
    name: "createListing",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assetId", type: "bytes32" },
      { name: "shareAmount", type: "uint256" },
      { name: "pricePerShareMinor", type: "uint256" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [{ name: "listingId", type: "uint256" }],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "listingId", type: "uint256" },
      { name: "shareAmount", type: "uint256" },
      { name: "maxCostMinor", type: "uint256" },
    ],
    outputs: [{ name: "costMinor", type: "uint256" }],
  },
  {
    type: "function",
    name: "cancelListing",
    stateMutability: "nonpayable",
    inputs: [{ name: "listingId", type: "uint256" }],
    outputs: [],
  },
] as const;

export const assetFactoryAbi = [
  {
    type: "function",
    name: "createAsset",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assetId", type: "bytes32" },
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "policyHash", type: "bytes32" },
      { name: "termsHash", type: "bytes32" },
      { name: "holders", type: "address[]" },
      { name: "shares", type: "uint256[]" },
    ],
    outputs: [{ name: "shareToken", type: "address" }],
  },
] as const;

export const vaultAbi = [
  {
    type: "function",
    name: "periodClaims",
    stateMutability: "view",
    inputs: [
      { name: "assetId", type: "bytes32" },
      { name: "periodKey", type: "bytes32" },
    ],
    outputs: [{ name: "claimId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "submitClaim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assetId", type: "bytes32" },
      { name: "periodKey", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "evidenceRoot", type: "bytes32" },
    ],
    outputs: [{ name: "claimId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "claimYield",
    stateMutability: "nonpayable",
    inputs: [{ name: "claimId", type: "bytes32" }],
    outputs: [],
  },
] as const;

export const stakingAbi = [
  {
    type: "function",
    name: "stake",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

export const attestationAbi = [
  {
    type: "function",
    name: "challenge",
    stateMutability: "payable",
    inputs: [
      { name: "attestationId", type: "bytes32" },
      { name: "counterEvidenceRoot", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "attestationId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "attestationId", type: "bytes32" },
      { name: "verifierUpheld", type: "bool" },
      { name: "finalOutcome", type: "uint8" },
      { name: "finalVerifiedAmount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
