import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

export const maxImageBytes = 10 * 1024 * 1024;
export const supportedContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;
export type SupportedContentType = (typeof supportedContentTypes)[number];

const extensionByContentType: Record<SupportedContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export function contentTypeFromResponse(
  response: Response
): SupportedContentType {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0];
  if (!supportedContentTypes.includes(contentType as SupportedContentType)) {
    throw new Error("Pexels returned an unsupported image content type.");
  }
  return contentType as SupportedContentType;
}

export function buildShowcaseStorageKey(
  provider: string,
  externalPhotoId: string,
  contentType: SupportedContentType
) {
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(provider)) {
    throw new Error("Invalid showcase provider.");
  }
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(externalPhotoId)) {
    throw new Error("Invalid showcase external photo ID.");
  }
  return `showcase/${provider}/${externalPhotoId}.${extensionByContentType[contentType]}`;
}

export function isShowcaseStorageKey(storageKey: string) {
  return /^showcase\/[a-z][a-z0-9_-]{1,39}\/[A-Za-z0-9_-]{1,120}\.(jpg|jpeg|png|webp)$/.test(
    storageKey
  );
}

export type R2ObjectStorage = {
  objectExists(key: string): Promise<boolean>;
  putObject(input: {
    key: string;
    body: Uint8Array;
    contentType: SupportedContentType;
  }): Promise<void>;
  deleteObject(key: string): Promise<void>;
};

export function createR2ObjectStorage(input: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): R2ObjectStorage {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${input.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey
    }
  });

  return {
    async objectExists(key) {
      try {
        await client.send(
          new HeadObjectCommand({ Bucket: input.bucket, Key: key })
        );
        return true;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "$metadata" in error &&
          typeof error.$metadata === "object" &&
          error.$metadata !== null &&
          "httpStatusCode" in error.$metadata &&
          error.$metadata.httpStatusCode === 404
        ) {
          return false;
        }
        throw error;
      }
    },
    async putObject({ key, body, contentType }) {
      await client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: key,
          Body: body,
          ContentType: contentType
        })
      );
    },
    async deleteObject(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: input.bucket, Key: key })
      );
    }
  };
}
