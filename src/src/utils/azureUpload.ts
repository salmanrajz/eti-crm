import { getFunctions, httpsCallable } from 'firebase/functions';

export async function uploadVerificationFileToAzure(leadId: string, file: File) {
  const functions = getFunctions();
  const callable = httpsCallable(functions, 'uploadVerificationMediaToAzure');
  const base64 = await fileToBase64(file);
  const res = await callable({
    leadId,
    fileName: file.name,
    contentType: file.type,
    base64,
  });
  return res.data as { success: boolean; url: string; path: string };
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


