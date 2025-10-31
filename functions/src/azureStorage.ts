import * as functions from "firebase-functions";
import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions, SASProtocol } from "@azure/storage-blob";

function getAzureClients() {
  const accountName = process.env.AZURE_STORAGE_NAME || (functions.config() as any)?.azure?.storage_name;
  const accountKey = process.env.AZURE_STORAGE_KEY || (functions.config() as any)?.azure?.storage_key;
  const containerName = process.env.AZURE_STORAGE_CONTAINER || (functions.config() as any)?.azure?.storage_container;

  if (!accountName || !accountKey || !containerName) {
    throw new Error("Missing Azure Storage configuration");
  }

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );

  return { blobServiceClient, containerName };
}

export async function uploadBufferToAzure(options: {
  buffer: Buffer;
  blobPath: string;
  contentType?: string;
  metadata?: Record<string, string>;
  sasTtlMinutes?: number;
}) {
  const { buffer, blobPath, contentType, metadata, sasTtlMinutes = 60 * 24 } = options;
  const { blobServiceClient, containerName } = getAzureClients();
  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists();

  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
  const uploadOptions = {
    blobHTTPHeaders: contentType ? { blobContentType: contentType } : undefined,
    metadata,
  } as any;

  await blockBlobClient.uploadData(buffer, uploadOptions);
  // Generate a temporary read-only SAS URL for private containers
  const accountName = blockBlobClient.accountName;
  const accountKey = process.env.AZURE_STORAGE_KEY || (functions.config() as any)?.azure?.storage_key;
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const expiresOn = new Date(Date.now() + sasTtlMinutes * 60 * 1000);
  const sas = generateBlobSASQueryParameters({
    containerName,
    blobName: blobPath,
    permissions: BlobSASPermissions.parse("r"),
    expiresOn,
    protocol: SASProtocol.HttpsAndHttp,
  }, credential).toString();
  const sasUrl = `${blockBlobClient.url}?${sas}`;
  return {
    url: sasUrl,
    path: blobPath,
    container: containerName,
    publicUrl: blockBlobClient.url,
    expiresOn: expiresOn.toISOString(),
  };
}

export const uploadVerificationMediaToAzure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required");
  }

  try {
    const leadId = (data?.leadId as string) || "";
    const fileName = (data?.fileName as string) || "";
    const contentType = (data?.contentType as string) || undefined;
    const base64 = (data?.base64 as string) || "";

    if (!leadId || !fileName || !base64) {
      throw new functions.https.HttpsError("invalid-argument", "leadId, fileName and base64 are required");
    }

    const buffer = Buffer.from(base64, "base64");
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobPath = `leads/${leadId}/verification/${Date.now()}_${safeName}`;

    const result = await uploadBufferToAzure({ buffer, blobPath, contentType });
    return { success: true, url: result.url, path: result.path, expiresOn: result.expiresOn };
  } catch (e: any) {
    console.error("uploadVerificationMediaToAzure failed", e);
    if (e instanceof functions.https.HttpsError) throw e;
    throw new functions.https.HttpsError("internal", e?.message || "Upload failed");
  }
});


