import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "taprobaneentertainment",
          upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET!,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(
            NextResponse.json({
              success: true,
              url: result?.secure_url,
            })
          );
        }
      );

      uploadStream.end(buffer);
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}