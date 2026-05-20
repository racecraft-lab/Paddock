import { describe, expect, it } from 'vitest'
import {
  PILOT_REVIEW_PACKET_JSON_ARTIFACT_TYPE,
  PILOT_REVIEW_PACKET_MARKDOWN_ARTIFACT_TYPE,
  PILOT_REVIEW_PACKET_SCHEMA_VERSION,
  buildPilotReviewPacket,
  publishPilotReviewPacketArtifacts,
  renderPilotReviewPacketMarkdown,
  type PacketArtifactPublisher,
} from '@/lib/pilot-review-packet'
import {
  SPEC009D_PR_TASK_ID,
  SPEC009D_WORKSPACE_ID,
  pilotArtifact,
  pilotGithubSync,
  pilotRootTask,
  provenPilotPacketInput,
} from './pilot-review-packet.fixtures'

function fakePublisher(): {
  publish: PacketArtifactPublisher
  calls: Parameters<PacketArtifactPublisher>[0][]
} {
  const calls: Parameters<PacketArtifactPublisher>[0][] = []
  return {
    calls,
    publish: (input) => {
      calls.push(input)
      return {
        id: calls.length,
        sha256: String(calls.length).repeat(64),
        storage_uri: null,
        byte_size: Buffer.byteLength(input.content ?? '', 'utf8'),
        redaction_status: 'pending',
        security_scan_status: 'pending',
      }
    },
  }
}

describe('SPEC-009D packet artifact publication', () => {
  it('publishes JSON and Markdown artifacts with v1 metadata from the same packet snapshot', () => {
    const packet = buildPilotReviewPacket(provenPilotPacketInput())
    const publisher = fakePublisher()

    const result = publishPilotReviewPacketArtifacts({
      packet,
      task_id: SPEC009D_PR_TASK_ID,
      active_workspace_id: SPEC009D_WORKSPACE_ID,
      is_facility_caller: false,
      publish: publisher.publish,
    })

    expect(publisher.calls).toHaveLength(2)
    expect(publisher.calls[0]).toMatchObject({
      artifact_type: PILOT_REVIEW_PACKET_JSON_ARTIFACT_TYPE,
      storage_kind: 'inline_json',
      mime: 'application/json',
      schema_version: PILOT_REVIEW_PACKET_SCHEMA_VERSION,
    })
    expect(JSON.parse(publisher.calls[0]?.content ?? '{}')).toEqual(packet)
    expect(publisher.calls[1]).toMatchObject({
      artifact_type: PILOT_REVIEW_PACKET_MARKDOWN_ARTIFACT_TYPE,
      storage_kind: 'inline_markdown',
      mime: 'text/markdown',
      schema_version: PILOT_REVIEW_PACKET_SCHEMA_VERSION,
    })
    expect(publisher.calls[1]?.content).toContain(`JSON artifact #${String(result.json.id)}`)
    expect(publisher.calls[1]?.content).toContain(result.json.sha256)
    expect(result.json_content).toBe(publisher.calls[0]?.content)
    expect(result.markdown_content).toBe(publisher.calls[1]?.content)
  })

  it('keeps Markdown lifecycle, gates, evidence, deferrals, warnings, and source-map summaries consistent with JSON', () => {
    const packet = buildPilotReviewPacket(provenPilotPacketInput({
      notifications: [],
    }))
    const markdown = renderPilotReviewPacketMarkdown(packet, {
      json_artifact: { id: 77, sha256: 'c'.repeat(64) },
    })

    expect(markdown).toContain('Current lifecycle stage')
    expect(markdown).toContain('ready_for_owner')
    expect(markdown).toContain('Aegis decision')
    expect(markdown).toContain('approved')
    expect(markdown).toContain('Deferred fields')
    expect(markdown).toContain('run_state')
    expect(markdown).toContain('Warnings')
    expect(markdown).toContain('missing_owner_gate')
    expect(markdown).toContain('/lifecycle/current_stage')
    expect(markdown).toContain('JSON artifact #77')
  })

  it('normalizes SPEC-007 artifact metadata and packet-local evidence states without extending artifact enums', () => {
    const packet = buildPilotReviewPacket(provenPilotPacketInput({
      artifacts: [
        pilotArtifact({ id: 510, redaction_status: 'redacted', preview_text: 'safe redacted preview' }),
        pilotArtifact({
          id: 511,
          redaction_status: 'quarantined',
          security_scan_status: 'scanned_with_findings',
          preview_text: 'must not leak',
          storage_uri: '/tmp/quarantined-secret.json',
        }),
        pilotArtifact({ id: 512, byte_size: 70 * 1024, storage_kind: 'file', preview_text: null }),
        pilotArtifact({
          id: 513,
          mime: 'application/zip',
          security_scan_status: 'scanned_with_findings',
          preview_text: 'binary preview must not leak',
        }),
        pilotArtifact({ id: 514, redaction_status: 'superseded', supersedes_artifact_id: 510 }),
      ],
    }))

    expect(packet.evidence.artifacts.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifact_id: 510,
        evidence_state: 'redacted',
        sha256: 'a'.repeat(64),
        byte_size: 1024,
        mime: 'application/json',
        preview_text: 'safe redacted preview',
      }),
      expect.objectContaining({
        artifact_id: 511,
        evidence_state: 'quarantined',
        preview_text: null,
        storage_uri: null,
      }),
      expect.objectContaining({
        artifact_id: 512,
        evidence_state: 'oversized',
        byte_size: 70 * 1024,
      }),
      expect.objectContaining({
        artifact_id: 513,
        evidence_state: 'quarantined',
        preview_text: null,
      }),
      expect.objectContaining({
        artifact_id: 514,
        evidence_state: 'superseded',
        supersedes_artifact_id: 510,
      }),
    ]))
  })

  it('escapes stored evidence strings, emits no raw HTML, and creates active links only from generated packet references', () => {
    const packet = buildPilotReviewPacket(provenPilotPacketInput({
      root_task: pilotRootTask({
        title: '<script>alert(1)</script> [evil](https://evil.test)',
      }),
      artifacts: [
        pilotArtifact({
          preview_text: '<img src=x onerror=alert(1)> [stored](https://evil.test) javascript:alert(1) data:text/html,alert(1) vbscript:msgbox(1)',
        }),
      ],
    }))
    const markdown = renderPilotReviewPacketMarkdown(packet, {
      json_artifact: { id: 2, sha256: 'd'.repeat(64) },
    })

    expect(markdown).not.toContain('<script>')
    expect(markdown).not.toContain('<img')
    expect(markdown).not.toContain('[evil](https://evil.test)')
    expect(markdown).not.toContain('[stored](https://evil.test)')
    expect(markdown).not.toContain('javascript:alert(1)')
    expect(markdown).not.toContain('data:text/html')
    expect(markdown).not.toContain('vbscript:msgbox')
    expect(markdown).toContain('https://github.com/racecraft-lab/mission-control/issues/52')
    expect(markdown).toContain('https://github.com/racecraft-lab/mission-control/pull/52')
  })

  it('safely publishes incomplete partial-proof packets without claiming pilot completion', () => {
    const packet = buildPilotReviewPacket(provenPilotPacketInput({
      descendant_tasks: [],
      github_syncs: [pilotGithubSync({ github_pr_number: null })],
      smoke_checklist_references: [],
    }))
    const publisher = fakePublisher()

    const result = publishPilotReviewPacketArtifacts({
      packet,
      task_id: SPEC009D_PR_TASK_ID,
      active_workspace_id: SPEC009D_WORKSPACE_ID,
      is_facility_caller: false,
      publish: publisher.publish,
    })
    const json = JSON.parse(result.json_content) as { candidate: { state: string } }

    expect(json.candidate.state).toBe('incomplete')
    expect(result.markdown_content).toContain('incomplete')
    expect(result.markdown_content).not.toContain('proven pilot complete')
  })
})
