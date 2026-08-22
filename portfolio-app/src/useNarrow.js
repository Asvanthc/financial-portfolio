import { useEffect, useState } from 'react'

// True on phone-width screens. Some layouts can't be rescued with CSS alone — a
// 5-column money table clipped its own figures ("₹2.77L" painting as "₹2.77"), so
// those switch to a stacked layout instead of shrinking.
export default function useNarrow(maxWidth = 640) {
  const query = `(max-width: ${maxWidth}px)`
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const onChange = e => setNarrow(e.matches)
    setNarrow(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [query])
  return narrow
}
