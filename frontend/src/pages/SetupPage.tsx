import { useState } from 'react'
import {
  Check, Copy, Terminal, AlertTriangle, Loader2, AlertCircle,
  FileCode, Zap, Wrench, HelpCircle, CheckCircle2, Download,
  Link2, BookOpen, Server,
} from 'lucide-react'

import {
  AGENT_CLIENTS,
  type AgentClient,
  type ConfigLocation,
  type SetupFile,
  type SetupGuide,
} from '../api/setupApi'
import { normalizeError } from '../api/axios'
import { useCurrentUser, useSetupGuide } from '../hooks/queries/useAuth'
import { useAppSelector } from '../store'

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-500 text-[#374151] border border-[#D1D9E0] rounded-[6px] hover:bg-[#EEF2F7] cursor-pointer transition-colors flex-shrink-0 bg-white"
    >
      {copied ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
      {copied ? 'Copied' : (label ?? 'Copy')}
    </button>
  )
}

/**
 * Downloads a generated file.
 *
 * Built in the browser from text we already have, so it needs no endpoint and
 * works for anyone — including people who have never cloned the repository.
 *
 * The saved name is the basename: browsers will not honour a path in the
 * download attribute, and pretending otherwise would leave the file in the
 * wrong place with no warning. Each card states the real destination separately.
 */
function DownloadButton({ path, contents }: { path: string; contents: string }) {
  const filename = path.split('/').pop() ?? 'config.json'

  const download = () => {
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  return (
    <button
      onClick={download}
      className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-500 text-white bg-[#2563EB] rounded-[6px] hover:bg-[#1D4ED8] cursor-pointer transition-colors flex-shrink-0"
    >
      <Download size={11} />
      Download
    </button>
  )
}

function Section({
  step,
  icon,
  title,
  subtitle,
  children,
}: {
  step: string
  icon: React.ReactNode
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-7">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-5 h-5 rounded-full bg-[#20242B] text-white text-[10px] font-700 flex items-center justify-center flex-shrink-0">
          {step}
        </span>
        <span className="text-[#6B7280]">{icon}</span>
        <h2 className="text-[14px] font-700 text-[#20242B]">{title}</h2>
      </div>
      {subtitle && <p className="text-[12px] text-[#6B7280] mb-3 ml-7">{subtitle}</p>}
      <div className="ml-7">{children}</div>
    </section>
  )
}

/** A shell command, wrapped rather than clipped: a half-copied command fails oddly. */
function CommandBlock({ command }: { command: string }) {
  return (
    <div className="flex items-start gap-2">
      <code className="mono text-[11px] bg-[#20242B] text-[#E6E8EC] px-2 py-1.5 rounded flex-1 whitespace-pre-wrap break-all leading-relaxed">
        {command}
      </code>
      <CopyButton text={command} />
    </div>
  )
}

/**
 * One file to place, with its destination spelled out.
 *
 * The destination is the part people get wrong, and getting it wrong produces
 * no error — just an agent that never picks up the tools. So the path is
 * repeated in prose next to the download button, which saves under the bare
 * filename and cannot honour a directory.
 */
function FileCard({ file, locations }: { file: SetupFile; locations: ConfigLocation[] }) {
  return (
    <div className="border border-[#D1D9E0] rounded-[6px] mb-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#F8FAFC] border-b border-[#D1D9E0]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="mono text-[12px] font-600 text-[#20242B] truncate">{file.path}</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${
              file.action === 'merge'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]'
            }`}
          >
            {file.action === 'merge' ? 'add to existing' : 'new file'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <CopyButton text={file.contents} />
          <DownloadButton path={file.path} contents={file.contents} />
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[#F1F5F9]">
        <div className="text-[11px] text-[#6B7280]">{file.purpose}</div>
        <div className="text-[11px] text-[#374151] mt-1">
          Save it as{' '}
          <code className="mono bg-[#F8FAFC] border border-[#D1D9E0] px-1 py-0.5 rounded">
            {file.path}
          </code>{' '}
          {/*
            Per-OS locations are supplied exactly when the file is machine-wide
            rather than project-relative, so they are the signal to use here.
            The path alone is not: Claude Desktop's is a bare filename, which
            reads as project-relative and is not.
          */}
          {locations.length > 0
            ? 'at the location for your operating system below'
            : file.path.startsWith('~/') || file.path.startsWith('%')
              ? 'in your home folder'
              : 'inside the project you want to connect'}
          {file.action === 'merge' && ', merging into the existing file rather than replacing it'}.
        </div>

        {/*
          Where the file lives differs per OS for anything machine-wide, and a
          "~/…" that the reader has to expand themselves is exactly where this
          goes wrong — so each path is given in full.
        */}
        {locations.length > 0 && (
          <div className="mt-2 border border-[#D1D9E0] rounded-[6px] overflow-hidden">
            {locations.map((location) => (
              <div
                key={location.os}
                className="flex items-start gap-2 px-2 py-1.5 border-b border-[#F1F5F9] last:border-b-0 bg-white"
              >
                <span className="text-[10px] font-600 text-[#6B7280] w-24 flex-shrink-0 pt-0.5">
                  {location.os}
                </span>
                <code className="mono text-[10px] text-[#20242B] break-all flex-1">
                  {location.path}
                </code>
                <CopyButton text={location.path} label="Path" />
              </div>
            ))}
          </div>
        )}
      </div>

      <pre className="mono text-[11px] bg-[#20242B] text-[#E6E8EC] p-3 overflow-x-auto max-h-72 whitespace-pre">
        {file.contents}
      </pre>
    </div>
  )
}

/**
 * The endpoint, given before anything else.
 *
 * Someone arriving on this page with a client we have no recipe for still has
 * everything they need from this one box: a URL, and the owner handle already
 * in it. Every route below is a different way of writing this same string into
 * a config file.
 */
function EndpointCard({ guide }: { guide: SetupGuide }) {
  return (
    <div className="border border-[#D1D9E0] rounded-[6px] overflow-hidden bg-white">
      <div className="px-3 py-2 bg-[#F8FAFC] border-b border-[#D1D9E0] flex items-center gap-2">
        <Server size={12} className="text-[#6B7280]" />
        <span className="text-[11px] font-600 text-[#374151]">
          Your MCP endpoint — a remote server, so there is nothing to install
        </span>
      </div>

      <div className="p-3">
        <div className="flex items-start gap-2">
          <code className="mono text-[12px] bg-[#20242B] text-[#E6E8EC] px-2.5 py-2 rounded flex-1 break-all leading-relaxed">
            {guide.serverUrl}
          </code>
          <CopyButton text={guide.serverUrl} label="Copy URL" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#6B7280]">
          <span>
            Owner{' '}
            <code className="mono bg-[#F8FAFC] border border-[#D1D9E0] px-1 py-0.5 rounded text-[#20242B]">
              {guide.owner}
            </code>
          </span>
          <span>
            Transport{' '}
            <span className="font-600 text-[#374151]">
              {guide.transport === 'http' ? 'HTTP (direct)' : 'stdio via bridge'}
            </span>
          </span>
          <span>
            API{' '}
            <code className="mono text-[10px] text-[#374151] break-all">{guide.apiUrl}</code>
          </span>
        </div>

        {/*
          Signed-out readers get a stand-in handle. Saving it verbatim is worse
          than it looks: their reports would pool under a shared identity, and
          verification counts distinct owners, so nothing they confirm would
          ever count.
        */}
        {guide.ownerIsPlaceholder && (
          <div className="mt-3 flex items-start gap-2 border border-[#FED7AA] bg-[#FFF7ED] rounded-[6px] p-2.5">
            <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-800 leading-relaxed">
              <span className="font-600">This is a placeholder handle.</span> Sign in and reload
              this page to get your own, or replace{' '}
              <code className="mono">my-handle</code> everywhere it appears before you save
              anything. Handles are the independence key — reports sharing one count as a single
              party, however many machines they run on.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

type ConnectRoute = 'command' | 'file'

/**
 * Onboarding.
 *
 * Ordered the way someone actually proceeds: what the endpoint is, how to get
 * it into their client, what makes the agent reach for it, and how to tell
 * whether any of it worked.
 *
 * Two things drive the shape. **A failed connection is silent** — an agent with
 * no tools behaves identically to one that chose not to use them — so
 * verification is a step of its own rather than a footnote. And **the reader is
 * not on the machine running this service**, so every command and config here
 * is generated server-side from the public URL and contains no path that exists
 * only on our host.
 */
export function SetupPage() {
  const user = useAppSelector((s) => s.auth.user)
  useCurrentUser()

  const [client, setClient] = useState<AgentClient>('claude-code')
  // Null means "whichever route suits this client", which is what changing
  // clients should go back to.
  const [routeChoice, setRouteChoice] = useState<ConnectRoute | null>(null)
  const { data: guide, isLoading, error, refetch } = useSetupGuide(client, user?.handle)

  const selectClient = (value: AgentClient) => {
    setClient(value)
    setRouteChoice(null)
  }

  // The one-command route is offered first where it exists: assembling a file,
  // working out where it lives and getting the JSON shape right is where people
  // give up, and every mistake in it fails silently.
  const route: ConnectRoute =
    guide && (!guide.quickStart.available || routeChoice === 'file') ? 'file' : 'command'

  const [configFile, ...instructionFiles] = guide?.files ?? []

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <h1 className="text-[20px] font-700 text-[#20242B] mb-1">Connect your agent</h1>
      <p className="text-[13px] text-[#6B7280] mb-6">
        One URL, one instruction file, one restart. After this your agent searches here before
        guessing, and reports back what actually worked.
      </p>

      {isLoading && (
        <div className="border border-[#D1D9E0] rounded-[6px] p-8 text-center text-[13px] text-[#6B7280]">
          <Loader2 size={18} className="animate-spin mx-auto mb-2 text-[#2563EB]" />
          Building your instructions…
        </div>
      )}

      {error && (
        <div className="border border-red-200 bg-red-50 rounded-[6px] p-6 text-center">
          <AlertCircle size={18} className="text-red-500 mx-auto mb-2" />
          <div className="text-[13px] font-600 text-[#20242B] mb-1">Could not load the instructions</div>
          <div className="text-[12px] text-[#6B7280] mb-3">{normalizeError(error).message}</div>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 text-[12px] font-500 text-white bg-[#2563EB] rounded-[6px] hover:bg-[#1D4ED8] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {guide && (
        <>
          {/* 1 — which agent */}
          <Section
            step="1"
            icon={<Terminal size={14} />}
            title="Pick your agent"
            subtitle="Every client accepts a remote MCP server, but each one names the field differently. This picks the right dialect."
          >
            <div className="flex flex-wrap gap-2">
              {AGENT_CLIENTS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => selectClient(option.value)}
                  className={`px-3 py-1.5 rounded-[6px] text-[12px] font-500 border cursor-pointer transition-colors ${
                    client === option.value
                      ? 'bg-[#2563EB] text-white border-[#2563EB]'
                      : 'bg-white text-[#374151] border-[#D1D9E0] hover:border-[#2563EB] hover:text-[#2563EB]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {!guide.supported && (
              <div className="mt-3 flex items-start gap-2 border border-[#FED7AA] bg-[#FFF7ED] rounded-[6px] p-3">
                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-[12px] text-amber-800 leading-relaxed">
                  No specific recipe for this client, so the block below is a standard remote MCP
                  server. Check your client's documentation for where its config lives and which
                  field it reads a URL from — the URL itself is the same either way.
                </div>
              </div>
            )}
          </Section>

          {/* 2 — the endpoint, before any client-specific detail */}
          <Section
            step="2"
            icon={<Link2 size={14} />}
            title="Your endpoint"
            subtitle="This is the whole connection. Everything below is a way of writing it into a config file."
          >
            <EndpointCard guide={guide} />
          </Section>

          {/* 3 — getting it into the client, either way */}
          <Section
            step="3"
            icon={<FileCode size={14} />}
            title={`Add it to ${guide.clientLabel}`}
            subtitle={
              guide.quickStart.available
                ? 'Two routes to the same result. The quick one lets the client write the config itself; the manual one shows you exactly what it writes.'
                : `${guide.clientLabel} has no command for this, so the config file is the route.`
            }
          >
            {guide.quickStart.available && (
              <div className="flex gap-1 mb-3 p-0.5 bg-[#F1F5F9] rounded-[6px] w-fit">
                {/*
                  Labelled by outcome rather than by mechanism: for most clients
                  the quick route is a command, but for Cursor it is a URL
                  pasted into its own settings UI. "One command" would be a lie
                  on that tab. The panel itself says which it is.
                */}
                {([
                  ['command', 'Quickest route'],
                  ['file', 'Edit the config file'],
                ] as Array<[ConnectRoute, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setRouteChoice(value)}
                    className={`px-3 py-1 rounded-[4px] text-[12px] font-500 cursor-pointer transition-colors ${
                      route === value
                        ? 'bg-white text-[#20242B] shadow-sm'
                        : 'text-[#6B7280] hover:text-[#374151]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {route === 'command' ? (
              <div className="border border-[#D1D9E0] rounded-[6px] bg-white p-3">
                <div className="text-[12px] font-600 text-[#20242B] mb-0.5">
                  {guide.quickStart.title}
                </div>
                <div className="text-[12px] text-[#6B7280] leading-relaxed mb-3">
                  {guide.quickStart.detail}
                </div>

                <div className="space-y-3">
                  {guide.quickStart.commands.map((item) => (
                    <div key={item.label}>
                      <div className="text-[11px] font-600 text-[#374151] mb-1">{item.label}</div>
                      <CommandBlock command={item.command} />
                      {item.detail && (
                        <div className="text-[11px] text-[#6B7280] mt-1">{item.detail}</div>
                      )}
                    </div>
                  ))}
                </div>

                {guide.quickStart.expect && (
                  <div className="mt-3 flex items-start gap-2 border border-[#BFDBFE] bg-[#EFF6FF] rounded-[6px] p-2.5">
                    <CheckCircle2 size={13} className="text-[#2563EB] flex-shrink-0 mt-0.5" />
                    <div className="text-[11px] text-[#374151] leading-relaxed">
                      <span className="font-600">Expect: </span>
                      {guide.quickStart.expect}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {configFile && <FileCard file={configFile} locations={guide.locations} />}

                <div className="border border-[#D1D9E0] rounded-[6px] divide-y divide-[#D1D9E0] bg-white">
                  {guide.steps.map((step) => (
                    <div key={step.title} className="p-3">
                      <div className="text-[12px] font-600 text-[#20242B] mb-0.5">{step.title}</div>
                      <div className="text-[12px] text-[#6B7280] leading-relaxed">{step.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/*
            4 — the half that people skip.
            Connecting the server makes the tools available; it does not make the
            agent reach for them. Nothing intercepts errors, so without this the
            tools sit unused and the service looks useless.
          */}
          <Section
            step="4"
            icon={<BookOpen size={14} />}
            title="Tell it when to use them"
            subtitle="Needed on either route. Configuration makes the tools available, not used."
          >
            {instructionFiles.map((file) => (
              <FileCard key={file.path} file={file} locations={[]} />
            ))}
          </Section>

          {/* 5 — restart */}
          <Section step="5" icon={<Zap size={14} />} title={guide.restart.title}>
            <div className="border border-[#D1D9E0] rounded-[6px] p-3 text-[12px] text-[#6B7280] leading-relaxed bg-white">
              {guide.restart.detail}
            </div>
          </Section>

          {/* 6 — prove it */}
          <Section
            step="6"
            icon={<CheckCircle2 size={14} />}
            title="Check it actually worked"
            subtitle="Worth doing once: a failed connection produces no error anywhere."
          >
            <div className="border border-[#D1D9E0] rounded-[6px] divide-y divide-[#D1D9E0] bg-white">
              {guide.verification.map((step) => (
                <div key={step.title} className="p-3">
                  <div className="text-[12px] font-600 text-[#20242B] mb-0.5">{step.title}</div>
                  <div className="text-[12px] text-[#6B7280] leading-relaxed">{step.detail}</div>
                  {step.command && (
                    <div className="mt-2">
                      <CommandBlock command={step.command} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* 7 — when it does not work */}
          <Section
            step="7"
            icon={<Wrench size={14} />}
            title="If something is wrong"
            subtitle="Listed by symptom, because that is what you have when it fails."
          >
            <div className="border border-[#D1D9E0] rounded-[6px] divide-y divide-[#D1D9E0] bg-white">
              {guide.troubleshooting.map((item) => (
                <details key={item.symptom} className="group">
                  <summary className="p-3 cursor-pointer text-[12px] font-500 text-[#20242B] hover:bg-[#F8FAFC] flex items-start gap-2">
                    <HelpCircle size={13} className="text-[#9CA3AF] flex-shrink-0 mt-0.5" />
                    <span>{item.symptom}</span>
                  </summary>
                  <div className="px-3 pb-3 pl-8 space-y-1.5">
                    <div className="text-[12px] text-[#6B7280] leading-relaxed">
                      <span className="font-600 text-[#374151]">Why: </span>
                      {item.cause}
                    </div>
                    <div className="text-[12px] text-[#6B7280] leading-relaxed">
                      <span className="font-600 text-[#374151]">Fix: </span>
                      {item.fix}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </Section>

          {guide.notes.length > 0 && (
            <div className="border border-[#BFDBFE] bg-[#EFF6FF] rounded-[6px] p-3 ml-7">
              <div className="text-[11px] font-600 text-[#2563EB] uppercase tracking-wide mb-2">
                Worth knowing
              </div>
              <ul className="space-y-1.5">
                {guide.notes.map((note) => (
                  <li key={note} className="text-[12px] text-[#374151] leading-relaxed flex gap-2">
                    <span className="text-[#2563EB] flex-shrink-0">·</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
