"use client";

import { createContext, useContext, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, MouseSensor, pointerWithin, TouchSensor, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import styles from "./CatalogSortArea.module.css";

type SortHandleProps = ButtonHTMLAttributes<HTMLButtonElement> & { ref: Ref<HTMLButtonElement> };
type SortPointerProps = Pick<ButtonHTMLAttributes<HTMLButtonElement>, "onMouseDown" | "onTouchStart" | "style">;
export type CatalogSortDrag = Readonly<{ handleProps: SortHandleProps; pointerProps: SortPointerProps; isDragging: boolean }>;
type Scope = Readonly<{ disabled: boolean; name(id: string): string }>;
const SortScope = createContext<Scope>({ disabled: true, name: id => id });
const collisionDetection: CollisionDetection = input => input.pointerCoordinates ? pointerWithin(input) : closestCenter(input);

export function CatalogSortArea({ ids, onMove, disabled = false, layout = "grid", label, children, getLabel }: Readonly<{
  ids: readonly string[];
  onMove(source: string, target: string): void;
  disabled?: boolean;
  layout?: "grid" | "list";
  label: string;
  children: ReactNode;
  getLabel?(id: string): string;
}>) {
  const contextId = useId();
  const blocked = disabled || ids.length < 2 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || !id);
  const signature = JSON.stringify(ids);
  const current = useRef({ ids, signature, blocked, revision: 0, onMove, getLabel });
  const previous = current.current;
  current.current = { ids, signature, blocked, revision: previous.revision + (previous.signature !== signature || previous.blocked !== blocked ? 1 : 0), onMove, getLabel };
  const gesture = useRef<Readonly<{ id: string; revision: number }> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const name = (id: string) => current.current.getLabel?.(id) || id;
  function end(event: DragEndEvent) {
    const started = gesture.current;
    gesture.current = null; setActiveId(null);
    const latest = current.current;
    if (!started || latest.blocked || started.revision !== latest.revision || event.active.id !== started.id || !event.over) return;
    const target = event.over.id;
    if (typeof target !== "string" || target === started.id || !latest.ids.includes(started.id) || !latest.ids.includes(target)) return;
    latest.onMove(started.id, target);
  }
  return <DndContext id={contextId} sensors={sensors} collisionDetection={collisionDetection}
    accessibility={{
      screenReaderInstructions: { draggable: `${label}. Taşımak için boşluk tuşuna basın. Yön tuşlarıyla yeni konumu seçin; bırakmak için tekrar boşluk, vazgeçmek için Escape tuşuna basın.` },
      announcements: {
        onDragStart: ({ active }) => `${name(String(active.id))} taşınıyor.`,
        onDragOver: ({ active, over }) => over ? `${name(String(active.id))}, ${name(String(over.id))} konumunda.` : "Sıralama alanının dışındasınız.",
        onDragEnd: () => "Sıralama hareketi tamamlandı.",
        onDragCancel: () => "Taşıma iptal edildi. Sıralama değişmedi.",
      },
    }}
    onDragStart={({ active }) => {
      const latest = current.current;
      if (latest.blocked || typeof active.id !== "string" || !latest.ids.includes(active.id)) return;
      gesture.current = { id: active.id, revision: latest.revision }; setActiveId(active.id);
    }}
    onDragEnd={end}
    onDragCancel={() => { gesture.current = null; setActiveId(null); }}>
    <SortableContext items={[...ids]} strategy={layout === "list" ? verticalListSortingStrategy : rectSortingStrategy} disabled={blocked}>
      <SortScope.Provider value={{ disabled: blocked, name }}>{children}</SortScope.Provider>
    </SortableContext>
    <DragOverlay dropAnimation={null}>{activeId ? <div className={styles.overlay}>{name(activeId)}</div> : null}</DragOverlay>
  </DndContext>;
}

export function CatalogSortItem({ id, className, as: Tag = "div", children }: Readonly<{
  id: string;
  className?: string;
  as?: "div" | "article";
  children(drag: CatalogSortDrag): ReactNode;
}>) {
  const scope = useContext(SortScope);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: scope.disabled });
  const handleProps: SortHandleProps = {
    ...attributes, ...listeners, type: "button", ref: setActivatorNodeRef, disabled: scope.disabled,
    "aria-label": `${scope.name(id)} sırasını değiştir`, "aria-roledescription": "Sıralanabilir öğe",
    style: { touchAction: scope.disabled ? "auto" : "none", cursor: isDragging ? "grabbing" : "grab" },
  };
  const pointerProps: SortPointerProps = {
    onMouseDown: scope.disabled ? undefined : event => listeners?.onMouseDown?.(event),
    onTouchStart: scope.disabled ? undefined : event => listeners?.onTouchStart?.(event),
    style: { touchAction: scope.disabled ? "auto" : "none" },
  };
  return <Tag ref={setNodeRef} className={[styles.item, className].filter(Boolean).join(" ")} data-sort-id={id} data-sort-dragging={isDragging || undefined}
    style={{ transform: CSS.Transform.toString(transform), transition }}>
    {children({ handleProps, pointerProps, isDragging })}
  </Tag>;
}
