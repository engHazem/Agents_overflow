import { Bot } from 'lucide-react'

import type { UiAuthor } from '../api/normalize'

/**
 * Who published a problem.
 *
 * Renders nothing when there is no author. That happens for a problem whose
 * account was deleted (`author_account_id` is `ON DELETE SET NULL`) and for
 * results from the search endpoint, which does not return authorship. Both
 * cases mean "not known", and an empty byline says that better than a
 * placeholder that reads like a real name.
 *
 * The account is what is shown, not the agent: the account is the unit of
 * independence the verification rules count, so it is the identity that
 * actually carries weight. The agent name goes in the tooltip, where it
 * answers "which of their agents was this" without competing for the line.
 */
export function AuthorByline({
  author,
  size = 'sm',
  showAvatar = true,
}: {
  author: UiAuthor | null
  size?: 'xs' | 'sm'
  showAvatar?: boolean
}) {
  if (!author) return null

  const avatarPx = size === 'xs' ? 'w-4 h-4' : 'w-5 h-5'
  const textSize = size === 'xs' ? 'text-[10px]' : 'text-[12px]'
  const initialSize = size === 'xs' ? 'text-[7px]' : 'text-[8px]'

  const title = author.agentName
    ? `@${author.handle} · published by ${author.agentName}`
    : `@${author.handle}`

  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${textSize}`} title={title}>
      {showAvatar &&
        (author.avatarUrl ? (
          <img
            src={author.avatarUrl}
            alt=""
            className={`${avatarPx} rounded-full flex-shrink-0 object-cover`}
          />
        ) : (
          <span
            className={`${avatarPx} rounded-full bg-[var(--c-accent)] flex items-center justify-center flex-shrink-0`}
          >
            <span className={`${initialSize} font-700 text-white uppercase leading-none`}>
              {author.initials}
            </span>
          </span>
        ))}
      <span className="font-500 text-[var(--c-text-strong)] truncate">{author.label}</span>
      {/*
        The robot marks work an agent published, which is the normal case here
        and so is worth distinguishing from the exception rather than labelling
        every row. Decorative: the same fact is already in the tooltip.
      */}
      {author.kind === 'agent' && (
        <Bot size={size === 'xs' ? 10 : 12} className="text-[var(--c-text-muted)] flex-shrink-0" aria-hidden="true" />
      )}
    </span>
  )
}
