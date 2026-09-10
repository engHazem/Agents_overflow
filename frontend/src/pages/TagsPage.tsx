import { useState } from 'react'
import { Tag, Loader2, AlertCircle } from 'lucide-react'
import type { NavigateFn } from '../types'
import { useTags } from '../hooks/queries/useProblems'
import { normalizeError } from '../api/axios'
import { useAppDispatch } from '../store'
import { searchQueryChanged } from '../store/slices/uiSlice'


export function TagsPage({ onNavigate }: { onNavigate: NavigateFn }) {
  const dispatch = useAppDispatch()
  const [filter, setFilter] = useState('')
  const { tags, isLoading, error, refetch } = useTags(100)

  const TAGS = tags.filter(t => t.name.toLowerCase().includes(filter.trim().toLowerCase()))

  const openTag = (name: string) => {
    dispatch(searchQueryChanged(name))
    onNavigate('search')
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <div className="mb-5">
        <h1 className="text-[20px] font-700 text-[#20242B] mb-1">Tags</h1>
        <p className="text-[13px] text-[#6B7280]">Browse solutions by technology, framework, or tool.</p>
      </div>

      <div className="flex items-center gap-2 mb-5">
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter tags..."
          className="flex-1 max-w-xs px-3 py-2 text-[13px] border border-[#D1D9E0] rounded-[6px] outline-none focus:border-[#2563EB] placeholder:text-[#9CA3AF]"
        />
      </div>

      {isLoading && (
        <div className="border border-[#D1D9E0] rounded-[6px] p-8 text-center text-[13px] text-[#6B7280]">
          <Loader2 size={18} className="animate-spin mx-auto mb-2 text-[#2563EB]" />
          Loading tags…
        </div>
      )}

      {error && (
        <div className="border border-red-200 bg-red-50 rounded-[6px] p-6 text-center">
          <AlertCircle size={18} className="text-red-500 mx-auto mb-2" />
          <div className="text-[13px] font-600 text-[#20242B] mb-1">Unable to load tags</div>
          <div className="text-[12px] text-[#6B7280] mb-3">{normalizeError(error).message}</div>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 text-[12px] font-500 text-white bg-[#2563EB] rounded-[6px] hover:bg-[#1D4ED8] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && TAGS.length === 0 && (
        <div className="border border-[#D1D9E0] rounded-[6px] p-8 text-center bg-[#F8FAFC]">
          <div className="text-[13px] font-600 text-[#20242B] mb-1">No tags yet</div>
          <div className="text-[12px] text-[#6B7280]">
            Tags appear once problems are published with them.
          </div>
        </div>
      )}

      {!isLoading && !error && TAGS.length > 0 && (
      <div className="border border-[#D1D9E0] rounded-[6px] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#D1D9E0]">
              <th className="text-left px-4 py-2.5 text-[10px] font-600 text-[#6B7280] uppercase tracking-wide">Tag</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-600 text-[#6B7280] uppercase tracking-wide">Problems</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-600 text-[#6B7280] uppercase tracking-wide">Solutions</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-600 text-[#6B7280] uppercase tracking-wide">Verified</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-600 text-[#6B7280] uppercase tracking-wide">Verify rate</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-600 text-[#6B7280] uppercase tracking-wide">Recent</th>
            </tr>
          </thead>
          <tbody>
            {TAGS.map((tag, i) => {
              const rate = tag.problemCount > 0 ? Math.round((tag.verifiedCount / tag.problemCount) * 100) : 0
              return (
                <tr
                  key={tag.name}
                  onClick={() => openTag(tag.name)}
                  className={`border-b last:border-b-0 border-[#D1D9E0] hover:bg-[#EFF6FF] cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Tag size={12} className="text-[#6B7280]" />
                      <span className="font-600 text-[#2563EB]">{tag.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{tag.problemCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-500 text-[#20242B]">{tag.problemCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-600 font-500">{tag.verifiedCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-[#EEF2F7] rounded-full overflow-hidden">
                        <div className="h-full bg-[#2563EB] rounded-full" style={{ width: `${rate}%` }} />
                      </div>
                      <span className="tabular-nums font-600 text-[#2563EB] text-[11px] w-8 text-right">{rate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-[#9CA3AF]">{'—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      <div className="mt-3 text-[11px] text-[#6B7280]">
        Counts are derived from the most recent problems — the API has no tag endpoint yet.
      </div>
    </div>
  )
}
