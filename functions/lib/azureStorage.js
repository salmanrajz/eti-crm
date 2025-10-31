"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadVerificationMediaToAzure = void 0;
exports.uploadBufferToAzure = uploadBufferToAzure;
const functions = require("firebase-functions");
const storage_blob_1 = require("@azure/storage-blob");
function getAzureClients() {
    var _a, _b, _c, _d, _e, _f;
    const accountName = process.env.AZURE_STORAGE_NAME || ((_b = (_a = functions.config()) === null || _a === void 0 ? void 0 : _a.azure) === null || _b === void 0 ? void 0 : _b.storage_name);
    const accountKey = process.env.AZURE_STORAGE_KEY || ((_d = (_c = functions.config()) === null || _c === void 0 ? void 0 : _c.azure) === null || _d === void 0 ? void 0 : _d.storage_key);
    const containerName = process.env.AZURE_STORAGE_CONTAINER || ((_f = (_e = functions.config()) === null || _e === void 0 ? void 0 : _e.azure) === null || _f === void 0 ? void 0 : _f.storage_container);
    if (!accountName || !accountKey || !containerName) {
        throw new Error("Missing Azure Storage configuration");
    }
    const credential = new storage_blob_1.StorageSharedKeyCredential(accountName, accountKey);
    const blobServiceClient = new storage_blob_1.BlobServiceClient(`https://${accountName}.blob.core.windows.net`, credential);
    return { blobServiceClient, containerName };
}
async function uploadBufferToAzure(options) {
    var _a, _b;
    const { buffer, blobPath, contentType, metadata, sasTtlMinutes = 60 * 24 } = options;
    const { blobServiceClient, containerName } = getAzureClients();
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    const uploadOptions = {
        blobHTTPHeaders: contentType ? { blobContentType: contentType } : undefined,
        metadata,
    };
    await blockBlobClient.uploadData(buffer, uploadOptions);
    // Generate a temporary read-only SAS URL for private containers
    const accountName = blockBlobClient.accountName;
    const accountKey = process.env.AZURE_STORAGE_KEY || ((_b = (_a = functions.config()) === null || _a === void 0 ? void 0 : _a.azure) === null || _b === void 0 ? void 0 : _b.storage_key);
    const credential = new storage_blob_1.StorageSharedKeyCredential(accountName, accountKey);
    const expiresOn = new Date(Date.now() + sasTtlMinutes * 60 * 1000);
    const sas = (0, storage_blob_1.generateBlobSASQueryParameters)({
        containerName,
        blobName: blobPath,
        permissions: storage_blob_1.BlobSASPermissions.parse("r"),
        expiresOn,
        protocol: storage_blob_1.SASProtocol.HttpsAndHttp,
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
exports.uploadVerificationMediaToAzure = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Auth required");
    }
    try {
        const leadId = (data === null || data === void 0 ? void 0 : data.leadId) || "";
        const fileName = (data === null || data === void 0 ? void 0 : data.fileName) || "";
        const contentType = (data === null || data === void 0 ? void 0 : data.contentType) || undefined;
        const base64 = (data === null || data === void 0 ? void 0 : data.base64) || "";
        if (!leadId || !fileName || !base64) {
            throw new functions.https.HttpsError("invalid-argument", "leadId, fileName and base64 are required");
        }
        const buffer = Buffer.from(base64, "base64");
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const blobPath = `leads/${leadId}/verification/${Date.now()}_${safeName}`;
        const result = await uploadBufferToAzure({ buffer, blobPath, contentType });
        return { success: true, url: result.url, path: result.path, expiresOn: result.expiresOn };
    }
    catch (e) {
        console.error("uploadVerificationMediaToAzure failed", e);
        if (e instanceof functions.https.HttpsError)
            throw e;
        throw new functions.https.HttpsError("internal", (e === null || e === void 0 ? void 0 : e.message) || "Upload failed");
    }
});
//# sourceMappingURL=azureStorage.js.map