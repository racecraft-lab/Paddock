import { NextResponse } from 'next/server'
import { runOpenClaw } from '@/lib/command'

const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/openclaw/openclaw/releases/latest'

function parseStableSemver(version: string): number[] | null {
  const trimmed = version.trim()
  const match = trimmed.match(/^v?(\d+\.\d+\.\d+)$/)
  if (!match) return null

  const parts = match[1].split('.').map((part) => Number(part))
  if (parts.some(Number.isNaN)) return null

  return parts
}

function parseVersionFromReleaseTag(tag: string | null | undefined): string | null {
  const parsed = parseStableSemver(tag ? tag.trim() : '')
  return parsed ? parsed.join('.') : null
}

function parseVersionFromOutput(stdout: string): string | null {
  const match = stdout.match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : null
}

function compareSemver(a: string, b: string): number {
  const pa = parseStableSemver(a)
  const pb = parseStableSemver(b)

  if (!pa || !pb) return 0

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

const headers = { 'Cache-Control': 'public, max-age=3600' }

export async function GET() {
  let installed: string | null = null

  try {
    const result = await runOpenClaw(['--version'], { timeoutMs: 3000 })
    installed = parseVersionFromOutput(result.stdout)
  } catch {
    // OpenClaw not installed or not reachable
    return NextResponse.json(
      { installed: null, latest: null, updateAvailable: false },
      { headers }
    )
  }

  if (!installed) {
    return NextResponse.json(
      { installed: null, latest: null, updateAvailable: false },
      { headers }
    )
  }

  try {
    const res = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { installed, latest: null, updateAvailable: false },
        { headers }
      )
    }

    const release = await res.json()
    const latest = parseVersionFromReleaseTag(release.tag_name)
    const updateAvailable = latest !== null ? compareSemver(latest, installed) > 0 : false

    return NextResponse.json(
      {
        installed,
        latest,
        updateAvailable,
        releaseUrl: release.html_url ?? '',
        releaseNotes: release.body ?? '',
        updateCommand: 'openclaw update --channel stable',
      },
      { headers }
    )
  } catch {
    return NextResponse.json(
      { installed, latest: null, updateAvailable: false },
      { headers }
    )
  }
}
