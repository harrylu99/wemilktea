import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type CommunityR2Storage = {
  createPutUrl(key: string, expiresIn: number): Promise<string>;
  headObject(key: string): Promise<{
    contentType: string | null;
    contentLength: number | null;
    etag: string | null;
  }>;
  deleteObject(key: string): Promise<void>;
};

export function createCommunityR2Storage(input: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): CommunityR2Storage {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${input.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey
    }
  });

  return {
    async createPutUrl(key, expiresIn) {
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: key,
          ContentType: "image/webp"
        }),
        { expiresIn }
      );
    },
    async headObject(key) {
      const response = await client.send(
        new HeadObjectCommand({ Bucket: input.bucket, Key: key })
      );
      return {
        contentType: response.ContentType ?? null,
        contentLength: response.ContentLength ?? null,
        etag: response.ETag ?? null
      };
    },
    async deleteObject(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: input.bucket, Key: key })
      );
    }
  };
}
