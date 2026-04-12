"use client";

import { useState } from "react";
import { FileText, Plus, X, Pencil, Trash2, User } from "lucide-react";

function formatTime(dateString: string | Date): string {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  if (isNaN(date.getTime())) return "Bilinmiyor";
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Az önce";
  if (diffMins < 60) return `${diffMins} dk`;
  if (diffHours < 24) return `${diffHours} sa`;
  if (diffDays < 7) return `${diffDays} gün`;

  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
  });
}

interface InternalNote {
  id: string;
  text: string;
  adminId?: string;
  adminName?: string;
  createdAt: Date | string;
}

interface InternalNotesProps {
  notes: InternalNote[];
  customerNote?: string;
  onAddNote: (text: string) => Promise<void>;
  onUpdateNote?: (noteId: string, text: string) => Promise<void>;
  onDeleteNote?: (noteId: string) => Promise<void>;
  currentAdminName?: string;
  className?: string;
}

export function InternalNotes({
  notes,
  customerNote,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  currentAdminName = "Admin",
  className = "",
}: InternalNotesProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const handleSubmit = async () => {
    if (!newNoteText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onAddNote(newNoteText.trim());
      setNewNoteText("");
      setIsAdding(false);
    } catch (error) {
      console.error("Not eklenirken hata:", error);
      alert("Not eklenirken bir hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !editText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onUpdateNote?.(editingId, editText.trim());
      setEditingId(null);
      setEditText("");
    } catch (error) {
      console.error("Not güncellenirken hata:", error);
      alert("Not güncellenirken bir hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm("Bu notu silmek istediğinizden emin misiniz?")) return;

    try {
      await onDeleteNote?.(noteId);
    } catch (error) {
      console.error("Not silinirken hata:", error);
      alert("Not silinirken bir hata oluştu.");
    }
  };

  const startEdit = (note: InternalNote) => {
    setEditingId(note.id);
    setEditText(note.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  return (
    <div className={`flex flex-col overflow-hidden rounded-[28px] border border-[#eadccd] bg-white/85 shadow-[0_18px_50px_rgba(148,101,63,0.08)] backdrop-blur ${className}`}>
      {/* Compact Header */}
      <div className="flex items-center justify-between border-b border-[#f1e6dc] bg-gradient-to-r from-[#fffaf5] to-white px-5 py-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#8a5b3c]" />
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-950">İç Notlar</h3>
            <span className="text-xs text-stone-400">({notes.length})</span>
          </div>
        </div>

        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="rounded-xl bg-gradient-to-r from-[#FE6100] to-[#d95a00] p-2 text-white shadow-sm transition-all hover:from-[#f56a12] hover:to-[#c94d00]"
            title="Yeni Not"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        {/* Customer Note (if exists) */}
        {customerNote && (
          <div className="mb-4 rounded-[22px] border border-amber-200 bg-amber-50 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Müşteri Notu</p>
            <p className="text-amber-900 text-sm">{customerNote}</p>
          </div>
        )}

        {/* Add Note Form */}
        {isAdding && (
          <div className="mb-4 rounded-[22px] border border-[#f0e3d6] bg-[#fcf8f4] p-3">
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Yeni not yazın..."
              rows={2}
              className="w-full resize-none rounded-2xl border border-[#e1d2c3] bg-white px-3 py-2.5 text-sm text-stone-700 focus:border-[#FE6100] focus:outline-none focus:ring-4 focus:ring-[#FE6100]/15"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewNoteText("");
                }}
                className="rounded-2xl border border-[#e1d2c3] bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition-colors hover:bg-[#fffaf5]"
              >
                İptal
              </button>
              <button
                onClick={handleSubmit}
                disabled={!newNoteText.trim() || isSubmitting}
                className="rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#d95a00] px-3 py-2 text-xs font-semibold text-white transition-all hover:from-[#f56a12] hover:to-[#c94d00] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "..." : "Ekle"}
              </button>
            </div>
          </div>
        )}

        {/* Notes List - Compact */}
        <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
          {notes.length === 0 ? (
            <div className="rounded-[22px] border-2 border-dashed border-[#eadccd] py-8 text-center">
              <FileText className="mx-auto mb-1.5 h-6 w-6 text-stone-300" />
              <p className="text-xs text-stone-400">Henüz not eklenmemiş</p>
            </div>
          ) : (
            notes.map((note) => {
              const isEditing = editingId === note.id;

              return (
                <div
                  key={note.id}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isEditing
                      ? "border-[#f0caa8] bg-[#fff4ea]"
                      : "border-[#f0e3d6] bg-[#fcf8f4] hover:border-[#e4cfbd]"
                  }`}
                >
                  {isEditing ? (
                    // Edit Mode
                    <div>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={2}
                          className="w-full resize-none rounded-2xl border border-[#e1d2c3] bg-white px-3 py-2 text-sm focus:border-[#FE6100] focus:outline-none focus:ring-4 focus:ring-[#FE6100]/15"
                        />
                        <div className="flex items-center justify-end gap-2 mt-2">
                          <button
                            onClick={cancelEdit}
                            className="rounded-xl border border-[#e1d2c3] bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:bg-[#fffaf5]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        <button
                          onClick={handleUpdate}
                          disabled={!editText.trim() || isSubmitting}
                            className="rounded-xl bg-gradient-to-r from-[#FE6100] to-[#d95a00] px-2.5 py-1.5 text-xs font-semibold text-white transition-all hover:from-[#f56a12] hover:to-[#c94d00] disabled:opacity-50"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FE6100] to-[#d95a00] text-white shadow-sm">
                        <User className="w-3 h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="break-words text-sm font-medium text-stone-900">
                              {note.text}
                            </p>
                            <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-stone-400">
                              {note.adminName || "Admin"} · {formatTime(note.createdAt)}
                            </p>
                          </div>
                          {(onUpdateNote || onDeleteNote) && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              {onUpdateNote && (
                                <button
                                  onClick={() => startEdit(note)}
                                  className="rounded-lg p-1 transition-colors hover:bg-white"
                                  title="Düzenle"
                                >
                                  <Pencil className="w-3 h-3 text-stone-400" />
                                </button>
                              )}
                              {onDeleteNote && (
                                <button
                                  onClick={() => handleDelete(note.id)}
                                  className="rounded-lg p-1 transition-colors hover:bg-white"
                                  title="Sil"
                                >
                                  <Trash2 className="w-3 h-3 text-stone-400 hover:text-red-500" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
