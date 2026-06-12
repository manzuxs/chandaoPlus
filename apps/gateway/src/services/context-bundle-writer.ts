import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { PageCapture } from "@chandaoplus/shared"

export async function writeContextBundle(workspaceRoot: string, sessionId: string, page: PageCapture): Promise<string> {
  const bundleDir = join(workspaceRoot, ".chandaoplus", "sessions", sessionId)
  await mkdir(join(bundleDir, "images"), { recursive: true })
  await writeFile(join(bundleDir, "page.md"), page.markdown, "utf8")
  await writeFile(
    join(bundleDir, "metadata.json"),
    JSON.stringify(
      {
        url: page.url,
        title: page.title,
        metadata: page.metadata,
        images: page.images.map((img) => ({
          filename: img.filename,
          alt: img.alt,
          sourceUrl: img.sourceUrl
        }))
      },
      null,
      2
    ),
    "utf8"
  )
  await Promise.all(
    page.images.map((image) =>
      writeFile(join(bundleDir, "images", image.filename), Buffer.from(image.base64Data, "base64"))
    )
  )
  return bundleDir
}
