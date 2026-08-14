import { get, put } from "@vercel/blob";
import { type EvidenceBundle } from "@veritable/schemas";
import { type Address, type Hex } from "viem";

function storageToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Private evidence storage is not configured");
  return token;
}

export async function storePreparedEvidence(input: {
  requester: Address;
  file: File;
  documentHash: Hex;
  bundle: EvidenceBundle;
}) {
  const owner = input.requester.toLowerCase();
  const safeName = input.file.name.replace(/[^A-Za-z0-9._-]/g, "_");
  const [documentBlob, bundleBlob] = await Promise.all([
    put(`evidence/${owner}/${input.documentHash}/${safeName}`, input.file, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: input.file.type,
      token: storageToken(),
    }),
    put(`evidence/${owner}/${input.bundle.modelRunHash}/bundle.json`, JSON.stringify(input.bundle), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: storageToken(),
    }),
  ]);
  return { documentPathname: documentBlob.pathname, bundlePathname: bundleBlob.pathname };
}

export async function storeClaimEvidence(claimId: Hex, bundle: EvidenceBundle) {
  return put(`claims/${claimId.toLowerCase()}/bundle.json`, JSON.stringify(bundle), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token: storageToken(),
  });
}

export async function loadClaimEvidence(claimId: Hex): Promise<EvidenceBundle | undefined> {
  const result = await get(`claims/${claimId.toLowerCase()}/bundle.json`, {
    access: "private",
    token: storageToken(),
  });
  if (!result || result.statusCode !== 200) return undefined;
  return new Response(result.stream).json() as Promise<EvidenceBundle>;
}
