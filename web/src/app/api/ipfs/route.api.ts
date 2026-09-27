import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Uploads a document to IPFS through Pinata and returns its CID.
 * The Pinata JWT stays on the server (PINATA_JWT) and is never exposed to the browser.
 */
export async function POST(req: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      { error: "PINATA_JWT is not set. Add it to web/.env.local or paste an existing URI instead." },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 25 MB." }, { status: 400 });

  const upload = new FormData();
  upload.append("file", file, file.name);
  upload.append("network", "public");
  upload.append("name", file.name);

  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: upload,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.data?.cid) {
    return NextResponse.json({ error: body?.error?.message || body?.error || `Pinata error ${res.status}` }, { status: 502 });
  }
  return NextResponse.json({ cid: body.data.cid as string, uri: `ipfs://${body.data.cid}` });
}
