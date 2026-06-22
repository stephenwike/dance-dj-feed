import { useRef, useEffect, useCallback } from 'react';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { patch } from '../requests';

/**
 * Drag-to-reorder for the queue column: optimistic UI update on drop,
 * with the actual queuePosition writes debounced and diffed against the
 * last-confirmed DB positions.
 */
export function useQueueReorder({ queue, mutate }) {
  const dbPositionsRef = useRef(null);   // last-confirmed DB positions
  const pendingReorderRef = useRef(null); // latest intended order waiting to flush
  const reorderTimerRef = useRef(null);

  // Keep dbPositionsRef in sync with what the server knows
  useEffect(() => {
    if (!dbPositionsRef.current) {
      dbPositionsRef.current = Object.fromEntries(queue.map(r => [r._id, r.queuePosition ?? 0]));
      return;
    }
    const currentIds = new Set(queue.map(r => r._id));
    for (const id of Object.keys(dbPositionsRef.current)) {
      if (!currentIds.has(id)) delete dbPositionsRef.current[id];
    }
    for (const r of queue) {
      if (!(r._id in dbPositionsRef.current)) {
        dbPositionsRef.current[r._id] = r.queuePosition ?? 0;
      }
    }
  }, [queue]);

  useEffect(() => () => { if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current); }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = queue.findIndex(r => r._id === active.id);
    const newIdx = queue.findIndex(r => r._id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(queue, oldIdx, newIdx);

    // Optimistic UI update — instant, no network call yet
    mutate(prev => {
      const pos = Object.fromEntries(reordered.map((r, i) => [r._id, i + 1]));
      return prev.map(r => r._id in pos ? { ...r, queuePosition: pos[r._id] } : r);
    }, false);

    // Accumulate the latest intended order and debounce the write
    pendingReorderRef.current = reordered;
    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
    reorderTimerRef.current = setTimeout(async () => {
      const finalQueue = pendingReorderRef.current;
      if (!finalQueue) return;
      const newPositions = Object.fromEntries(finalQueue.map((r, i) => [r._id, i + 1]));
      const dbPos = dbPositionsRef.current ?? {};
      const changed = finalQueue.filter(r => r._id in dbPos && dbPos[r._id] !== newPositions[r._id]);
      if (changed.length > 0) {
        await Promise.all(changed.map(r => patch(r._id, { queuePosition: newPositions[r._id] })));
        Object.assign(dbPositionsRef.current, newPositions);
      }
      pendingReorderRef.current = null;
      mutate();
    }, 600);
  }, [queue, mutate]);

  return { sensors, handleDragEnd };
}
