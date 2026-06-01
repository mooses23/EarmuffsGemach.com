// Extracted from inbox.tsx — contains the full detail view (conversation +
// reply box + dialogs), ThreadTranscriptPanel, and SaveToFaqPanel so that
// inbox.tsx stays at a manageable size.

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Building2, Pencil, Send, Sparkles, Languages,
  Eye, EyeOff, ShieldCheck, ShieldAlert, Undo2, AlertCircle,
  X, Trash2, CheckCircle2, ChevronDown, ChevronUp, Clock, Mail, MessageSquare,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { SuggestedDraftCard } from "./SuggestedDraftCard";
import type { Location } from "@shared/schema";
import type { TranslationKey } from "@/lib/translations";
import type { UnifiedItem, Folder, ThreadEntry, ThreadResponse, DraftMeta, BulkKind } from "./types";
import { formatDate, safeDate, sanitizeHtml, parseEmailAddress } from "./utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCitedId(raw: string): { kind: string; id: number } | null {
  const m = String(raw).trim().match(/^([a-z_]+)-(\d+)$/i);
  if (!m) return null;
  return { kind: m[1].toLowerCase(), id: Number(m[2]) };
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface InboxDetailViewProps {
  selected: UnifiedItem;
  setSelected: (item: UnifiedItem | null) => void;
  folder: Folder;
  t: (k: TranslationKey) => string;
  backButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
  currentItems: UnifiedItem[];
  performThreadAction: (
    items: UnifiedItem[],
    action: BulkKind,
    successMsg: string,
    failMsg: string,
    undoAction?: BulkKind,
    undoSuccessMsg?: string,
    undoFailMsg?: string,
  ) => void;

  isMarkReadPending: boolean;
  onToggleRead: () => void;

  replyText: string;
  setReplyText: React.Dispatch<React.SetStateAction<string>>;
  replySubject: string;
  setReplySubject: React.Dispatch<React.SetStateAction<string>>;
  forwardNote: string;
  setForwardNote: React.Dispatch<React.SetStateAction<string>>;
  linkCheckPending: boolean;
  brokenLinkWarning: { links: { url: string; reason?: string }[]; item: UnifiedItem } | null;
  setBrokenLinkWarning: React.Dispatch<React.SetStateAction<{ links: { url: string; reason?: string }[]; item: UnifiedItem } | null>>;
  sendReplyPending: boolean;
  onSendReply: (item: UnifiedItem) => void;

  suggestedDraft: string | null;
  setSuggestedDraft: React.Dispatch<React.SetStateAction<string | null>>;
  generatePending: boolean;
  onGenerate: (item: UnifiedItem) => void;
  translatePending: boolean;
  draftMeta: DraftMeta;
  draftClassification: string | null;
  reviewWarning: string | null;
  showWhyPanel: boolean;
  setShowWhyPanel: React.Dispatch<React.SetStateAction<boolean>>;
  matchedLocation: { id: number; name: string } | null;
  forwardPending: boolean;
  onForward: (vars: { emailId: string; locationId: number }) => void;
  onTranslateMessage: () => void;
  onTranslateReply: () => void;

  showSaveFaq: boolean;
  setShowSaveFaq: React.Dispatch<React.SetStateAction<boolean>>;
  faqQuestion: string;
  faqCategory: string;

  onEditOpen: () => void;
  editOpen: boolean;
  setEditOpen: React.Dispatch<React.SetStateAction<boolean>>;
  editSubject: string;
  setEditSubject: React.Dispatch<React.SetStateAction<string>>;
  editMessage: string;
  setEditMessage: React.Dispatch<React.SetStateAction<string>>;
  editContactPending: boolean;
  onSaveEdit: (vars: { id: number; subject: string; message: string }) => void;

  confirmDeleteId: number | null;
  setConfirmDeleteId: React.Dispatch<React.SetStateAction<number | null>>;
  deletePending: boolean;
  onDelete: (id: number) => void;

  pendingMixedTrash: { items: UnifiedItem[]; successTitle: string; failTitle: string } | null;
  setPendingMixedTrash: (v: { items: UnifiedItem[]; successTitle: string; failTitle: string } | null) => void;

  saveEmailBannerDismissed: boolean;
  setSaveEmailBannerDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  saveEmailLocationId: string;
  setSaveEmailLocationId: React.Dispatch<React.SetStateAction<string>>;
  saveEmailPending: boolean;
  setSaveEmailPending: React.Dispatch<React.SetStateAction<boolean>>;
  operatorEmailSet: Set<string>;
  locationsData: Location[] | undefined;

  translatedBody: string | null;
  uiTarget: "en" | "he";

  threadExpandedMap: Record<string, Record<string, boolean>>;
  setThreadExpandedMap: React.Dispatch<React.SetStateAction<Record<string, Record<string, boolean>>>>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InboxDetailView({
  selected,
  setSelected,
  folder,
  t,
  backButtonRef,
  currentItems,
  performThreadAction,
  isMarkReadPending,
  onToggleRead,
  replyText,
  setReplyText,
  replySubject,
  setReplySubject,
  forwardNote,
  setForwardNote,
  linkCheckPending,
  brokenLinkWarning,
  setBrokenLinkWarning,
  sendReplyPending,
  onSendReply,
  suggestedDraft,
  setSuggestedDraft,
  generatePending,
  onGenerate,
  translatePending,
  draftMeta,
  draftClassification,
  reviewWarning,
  showWhyPanel,
  setShowWhyPanel,
  matchedLocation,
  forwardPending,
  onForward,
  onTranslateMessage,
  onTranslateReply,
  showSaveFaq,
  setShowSaveFaq,
  faqQuestion,
  faqCategory,
  onEditOpen,
  editOpen,
  setEditOpen,
  editSubject,
  setEditSubject,
  editMessage,
  setEditMessage,
  editContactPending,
  onSaveEdit,
  confirmDeleteId,
  setConfirmDeleteId,
  deletePending,
  onDelete,
  pendingMixedTrash,
  setPendingMixedTrash,
  saveEmailBannerDismissed,
  setSaveEmailBannerDismissed,
  saveEmailLocationId,
  setSaveEmailLocationId,
  saveEmailPending,
  setSaveEmailPending,
  operatorEmailSet,
  locationsData,
  translatedBody,
  uiTarget,
  threadExpandedMap,
  setThreadExpandedMap,
}: InboxDetailViewProps) {
  const { toast } = useToast();

  const detailThreadRef = selected.source === "email"
    ? String(selected.threadId || selected.id)
    : String(selected.id);

  return (
    <div className="py-10">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button ref={backButtonRef} variant="ghost" size="sm" onClick={() => setSelected(null)} data-testid="button-back-to-inbox" aria-label={t("backToInbox")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("backToInbox")}
          </Button>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleRead}
              disabled={isMarkReadPending}
              data-testid="button-toggle-read"
            >
              {selected.isRead ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  {t("markAsUnread")}
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  {t("markAsRead")}
                </>
              )}
            </Button>
            {selected.isSpam || folder === "spam" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  performThreadAction(
                    currentItems,
                    "notSpam",
                    t("inboxNotSpamSuccess"),
                    t("inboxNotSpamFailed"),
                  );
                  setSelected(null);
                }}
                data-testid="button-not-spam"
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                {t("inboxDetailNotSpam")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  performThreadAction(
                    currentItems,
                    "spam",
                    t("inboxSpamSuccess"),
                    t("inboxSpamFailed"),
                    "notSpam",
                    t("inboxNotSpamSuccess"),
                    t("inboxNotSpamFailed"),
                  );
                  setSelected(null);
                }}
                data-testid="button-report-spam"
              >
                <ShieldAlert className="h-4 w-4 mr-2" />
                {t("inboxDetailReportSpam")}
              </Button>
            )}
            {(folder === "trash" || (selected.source === "form" && selected.isArchived)) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  performThreadAction(
                    currentItems,
                    "restore",
                    t("inboxRestoreSuccess"),
                    t("inboxRestoreFailed"),
                  );
                  setSelected(null);
                }}
                data-testid="button-restore"
              >
                <Undo2 className="h-4 w-4 mr-2" />
                {t("inboxDetailRestore")}
              </Button>
            )}
            {selected.source === "form" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEditOpen}
                  data-testid="button-edit-message"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  {t("msgEdit")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDeleteId(Number(selected.id))}
                  data-testid="button-delete-message"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("msgDelete")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* "Save email to profile" banner */}
        {(() => {
          const senderEmail = selected.fromEmail?.toLowerCase().trim() ?? "";
          const isKnownOperator = senderEmail && operatorEmailSet.has(senderEmail);
          const mentionsGemach = /gemach|gema[cç]h|גמ[״"']?ח/i.test(selected.body + " " + selected.subject);
          if (isKnownOperator || !mentionsGemach || saveEmailBannerDismissed) return null;
          const availableLocations = (locationsData ?? []).filter((l) => l.email !== selected.fromEmail);
          return (
            <div
              className="mb-4 rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-3 flex flex-col gap-2"
              data-testid="banner-save-email-to-profile"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 shrink-0" />
                  Possible gemach operator
                </div>
                <button
                  type="button"
                  className="text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
                  onClick={() => setSaveEmailBannerDismissed(true)}
                  aria-label="Dismiss"
                  data-testid="button-dismiss-save-email-banner"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-blue-800/90 dark:text-blue-200/90">
                This sender mentions a gemach but isn't linked to any location profile. You can save their email to a location so they'll be recognised as an operator in future.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={saveEmailLocationId} onValueChange={setSaveEmailLocationId}>
                  <SelectTrigger className="h-8 text-xs w-auto min-w-[200px] flex-1" data-testid="select-save-email-location">
                    <SelectValue placeholder="Select a location…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLocations.map((loc) => (
                      <SelectItem key={loc.id} value={String(loc.id)}>
                        {loc.name} · {loc.locationCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 text-xs"
                  disabled={!saveEmailLocationId || saveEmailPending}
                  data-testid="button-save-email-to-profile"
                  onClick={async () => {
                    if (!saveEmailLocationId || !selected.fromEmail) return;
                    setSaveEmailPending(true);
                    try {
                      await apiRequest("PATCH", `/api/locations/${saveEmailLocationId}`, { email: selected.fromEmail });
                      qc.invalidateQueries({ queryKey: ["/api/locations"] });
                      toast({ title: "Email saved", description: `${selected.fromEmail} linked to location profile.` });
                      setSaveEmailBannerDismissed(true);
                    } catch (e) {
                      toast({ title: "Error", description: e instanceof Error ? e.message : "Could not save email", variant: "destructive" });
                    } finally {
                      setSaveEmailPending(false);
                    }
                  }}
                >
                  {saveEmailPending ? "Saving…" : "Save to profile"}
                </Button>
              </div>
            </div>
          );
        })()}

        <ThreadTranscriptPanel
          selected={selected}
          folder={folder}
          t={t}
          translatedBody={translatedBody}
          onTranslateLatestInbound={onTranslateMessage}
          isTranslating={translatePending}
          uiTarget={uiTarget}
          expanded={threadExpandedMap[detailThreadRef] ?? {}}
          onExpandedChange={(updater) => {
            setThreadExpandedMap((prev) => ({
              ...prev,
              [detailThreadRef]: typeof updater === "function"
                ? updater(prev[detailThreadRef] ?? {})
                : updater,
            }));
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="h-5 w-5" />
              {t("reply")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[80px_1fr] gap-2 items-center text-sm">
              <span className="text-muted-foreground">{t("inboxTo")}</span>
              <span className="font-medium">
                {selected.fromName} {selected.fromEmail && <span className="text-muted-foreground">&lt;{selected.fromEmail}&gt;</span>}
              </span>
              <span className="text-muted-foreground">{t("subject")}</span>
              <Input
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
                data-testid="input-reply-subject"
              />
            </div>
            {selected.source === "email" && matchedLocation && (
              <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2" data-testid="panel-forward-operator">
                <div className="text-sm">
                  <div className="font-semibold text-blue-900 dark:text-blue-100">
                    Sender appears to be asking about: {matchedLocation.name}
                  </div>
                  <div className="text-xs text-blue-900/80 dark:text-blue-100/80 mt-1">
                    Forward this message to that gemach's operator instead of replying yourself.
                  </div>
                </div>
                <Textarea
                  placeholder="Optional note to the operator (e.g. 'Please follow up with this borrower directly')"
                  value={forwardNote}
                  onChange={(e) => setForwardNote(e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                  data-testid="textarea-forward-note"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={forwardPending}
                  onClick={() => onForward({ emailId: String(selected.id), locationId: matchedLocation.id })}
                  data-testid="button-forward-operator"
                >
                  {forwardPending ? "Forwarding…" : `Forward to ${matchedLocation.name}`}
                </Button>
              </div>
            )}
            {reviewWarning && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm flex items-start gap-2" data-testid="banner-needs-review">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-amber-900 dark:text-amber-100">{t("inboxNeedsReviewTitle")}</div>
                  <div className="text-amber-900/90 dark:text-amber-100/90 text-xs mt-1">{reviewWarning}</div>
                </div>
              </div>
            )}
            {suggestedDraft && (
              <SuggestedDraftCard
                draft={suggestedDraft}
                hasUserText={!!replyText.trim()}
                onUse={() => {
                  setReplyText(suggestedDraft);
                  setSuggestedDraft(null);
                }}
                onAppend={() => {
                  setReplyText((prev) => (prev.trim() ? `${prev}\n\n${suggestedDraft}` : suggestedDraft));
                  setSuggestedDraft(null);
                }}
                onDiscard={() => setSuggestedDraft(null)}
              />
            )}
            <Textarea
              placeholder={t("writeYourReply")}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={10}
              className="resize-none"
              data-testid="textarea-reply-body"
              aria-label={t("writeYourReply")}
            />
            {brokenLinkWarning && (
              <div
                className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2"
                data-testid="notice-broken-link-warning"
                role="alert"
                aria-live="polite"
              >
                <div className="flex items-start gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="font-semibold">
                      {brokenLinkWarning.links.length > 1 ? "Some links" : "A link"} in your reply could not be verified
                    </div>
                    <ul className="space-y-1">
                      {brokenLinkWarning.links.map(({ url, reason }) => (
                        <li key={url} className="rounded border border-destructive/30 bg-background px-2 py-1">
                          <span className="break-all font-mono text-xs">{url}</span>
                          {reason && <span className="block text-xs text-muted-foreground">{reason}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setBrokenLinkWarning(null)}
                    data-testid="button-broken-link-go-back"
                  >
                    Fix link
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      const itemToSend = brokenLinkWarning.item;
                      setBrokenLinkWarning(null);
                      onSendReply(itemToSend);
                    }}
                    data-testid="button-broken-link-send-anyway"
                  >
                    Send anyway
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onGenerate(selected)}
                  disabled={generatePending}
                  data-testid="button-generate-ai"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {generatePending ? t("generating") : t("generateAIResponse")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onTranslateReply}
                  disabled={!replyText.trim() || translatePending}
                  data-testid="button-translate-reply"
                >
                  <Languages className="h-4 w-4 mr-2" />
                  {t("inboxTranslateReply")}
                </Button>
              </div>
              <Button
                onClick={() => onSendReply(selected)}
                disabled={!replyText.trim() || sendReplyPending || linkCheckPending}
                data-testid="button-send-reply"
              >
                <Send className="h-4 w-4 mr-2" />
                {sendReplyPending ? t("sending") : linkCheckPending ? "Checking links…" : t("sendReply")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("inboxSentFromGemach")}</p>

            {draftMeta && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-2" data-testid="panel-why-this-draft">
                <button
                  type="button"
                  className="w-full flex items-center justify-between font-semibold text-sm"
                  onClick={() => setShowWhyPanel((v) => !v)}
                  data-testid="button-toggle-why-draft"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Why this draft
                    {typeof draftMeta.confidence === "number" && (
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono ${
                          draftMeta.confidence >= 0.8
                            ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100"
                            : draftMeta.confidence >= 0.6
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                            : "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100"
                        }`}
                        data-testid="badge-confidence"
                      >
                        {Math.round((draftMeta.confidence ?? 0) * 100)}%
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground">{showWhyPanel ? "−" : "+"}</span>
                </button>
                {showWhyPanel && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                      {draftMeta.todayIso && <div>Date used: <span className="font-mono text-foreground">{draftMeta.todayIso}</span></div>}
                      {draftClassification && <div>Classification: <span className="text-foreground">{draftClassification}</span></div>}
                      {draftMeta.language && <div>Language: <span className="text-foreground">{draftMeta.language}</span></div>}
                      {typeof draftMeta.senderHistoryCount === "number" && (
                        <div>Sender history: <span className="text-foreground">{draftMeta.senderHistoryCount}</span></div>
                      )}
                      {typeof draftMeta.threadHistoryCount === "number" && (
                        <div>Thread msgs: <span className="text-foreground">{draftMeta.threadHistoryCount}</span></div>
                      )}
                    </div>
                    {draftMeta.sources && draftMeta.sources.length > 0 ? (
                      <div>
                        {(() => {
                          const citedSet = new Set(
                            (draftMeta.citedSourceIds || [])
                              .map(parseCitedId)
                              .filter((x): x is { kind: string; id: number } => !!x)
                              .map((c) => `${c.kind}:${c.id}`)
                          );
                          return (
                            <>
                              <div className="font-semibold mb-1">
                                Sources used ({draftMeta.sources.length}
                                {citedSet.size > 0 ? `, ${citedSet.size} cited` : ""}):
                              </div>
                              <ul className="space-y-1">
                                {draftMeta.sources.map((s, i) => {
                                  const cited = citedSet.has(`${s.kind}:${s.id}`);
                                  const display = s.label || s.title || `${s.kind}-${s.id}`;
                                  return (
                                    <li key={`${s.kind}-${s.id}-${i}`} className={`flex gap-2 ${cited ? "" : "opacity-60"}`} data-testid={`source-${s.kind}-${s.id}`}>
                                      <span className="font-mono text-[10px] uppercase shrink-0 px-1 py-0.5 rounded bg-background border">{s.kind}</span>
                                      <span className="flex-1">
                                        <span className="font-medium">{display}</span>
                                        {cited && <span className="ml-1 text-green-700 dark:text-green-400">✓ cited</span>}
                                        {s.snippet && <div className="text-muted-foreground line-clamp-2">{s.snippet}</div>}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="text-muted-foreground italic">No knowledge-base matches were retrieved.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {showSaveFaq && (
              <SaveToFaqPanel
                defaultQuestion={faqQuestion}
                defaultCategory={faqCategory}
                answer={replyText}
                language={draftMeta?.language || "en"}
                onCancel={() => {
                  setShowSaveFaq(false);
                  setReplyText("");
                  setSelected(null);
                }}
                onSaved={() => {
                  setShowSaveFaq(false);
                  setReplyText("");
                  setSelected(null);
                }}
              />
            )}
          </CardContent>
        </Card>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("msgEditMessage")}</DialogTitle>
              <DialogDescription>{t("msgEditDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("subject")}</label>
                <Input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  data-testid="input-edit-subject"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("message")}</label>
                <Textarea
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  rows={6}
                  className="resize-none"
                  data-testid="textarea-edit-message"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                onClick={() =>
                  onSaveEdit({
                    id: Number(selected.id),
                    subject: editSubject,
                    message: editMessage,
                  })
                }
                disabled={editContactPending}
                data-testid="button-save-edit"
              >
                {editContactPending ? t("saving") : t("saveChanges")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmDeleteId !== null} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("msgConfirmDelete")}</AlertDialogTitle>
              <AlertDialogDescription>{t("msgConfirmDeleteDesc")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => confirmDeleteId !== null && onDelete(confirmDeleteId)}
              >
                {deletePending ? t("deleting") : t("msgDelete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Mixed-thread trash guard */}
        <AlertDialog open={pendingMixedTrash !== null} onOpenChange={(o) => !o && setPendingMixedTrash(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                {t("inboxMixedTrashTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("inboxMixedTrashDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingMixedTrash(null)}>
                {t("cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (!pendingMixedTrash) return;
                  const { items, successTitle, failTitle } = pendingMixedTrash;
                  setPendingMixedTrash(null);
                  performThreadAction(
                    items,
                    "trash",
                    successTitle,
                    failTitle,
                    items.every((m) => m.source === "email") ? "untrash" : undefined,
                    t("inboxRestoreSuccess"),
                    t("inboxRestoreFailed"),
                  );
                }}
              >
                {t("inboxMixedTrashConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  );
}

// ─── SaveToFaqPanel ───────────────────────────────────────────────────────────

function SaveToFaqPanel({
  defaultQuestion, defaultCategory, answer, language, onSaved, onCancel,
}: {
  defaultQuestion: string;
  defaultCategory: string;
  answer: string;
  language: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [question, setQuestion] = useState(defaultQuestion);
  const [category, setCategory] = useState(defaultCategory);
  const [editedAnswer, setEditedAnswer] = useState(answer);
  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/faq-entries", {
        question: question.trim(),
        answer: editedAnswer.trim(),
        category: category.trim() || "general",
        language: language === "he" ? "he" : "en",
        isActive: true,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved to knowledge base", description: "This Q&A will now be retrieved for similar future emails." });
      onSaved();
    },
    onError: (err: unknown) =>
      toast({ title: "Failed to save", description: err instanceof Error ? err.message : String(err), variant: "destructive" }),
  });
  return (
    <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2" data-testid="panel-save-to-faq">
      <div className="font-semibold text-sm text-blue-900 dark:text-blue-100">Save this reply to the knowledge base?</div>
      <div className="text-xs text-blue-900/80 dark:text-blue-100/80">Future emails like this will use it as a reference.</div>
      <Input
        placeholder="Question (what was the sender asking?)"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        data-testid="input-faq-question"
      />
      <Input
        placeholder="Category (e.g. returns, hours, location)"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        data-testid="input-faq-category"
      />
      <Textarea
        rows={4}
        value={editedAnswer}
        onChange={(e) => setEditedAnswer(e.target.value)}
        className="resize-none text-sm"
        data-testid="textarea-faq-answer"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} data-testid="button-skip-save-faq">Skip</Button>
        <Button
          size="sm"
          disabled={!question.trim() || !editedAnswer.trim() || saveMut.isPending}
          onClick={() => saveMut.mutate()}
          data-testid="button-save-faq"
        >
          {saveMut.isPending ? "Saving…" : "Save to FAQ"}
        </Button>
      </div>
    </div>
  );
}

// ─── ThreadTranscriptPanel ────────────────────────────────────────────────────
// Unified Gmail-style transcript for the inbox detail view. Shows EVERY
// message in the conversation (inbound + our outbound replies) oldest →
// newest, replacing the old "single message + sent-replies dropdown"
// layout. The selected message is auto-expanded; older messages are
// collapsed behind a one-line summary the admin can click to expand.
// On Gmail-fetch failure we fall back to the single selected-message
// body so the detail view always renders something.
//
// `expanded` / `onExpandedChange` are lifted to the parent so the
// expand/collapse state persists while the same conversation stays open
// even if the panel re-mounts (Fix B).

function ThreadTranscriptPanel({
  selected,
  folder,
  t,
  translatedBody,
  onTranslateLatestInbound,
  isTranslating,
  uiTarget,
  expanded,
  onExpandedChange,
}: {
  selected: UnifiedItem;
  folder: Folder;
  t: (k: TranslationKey) => string;
  translatedBody: string | null;
  onTranslateLatestInbound: () => void;
  isTranslating: boolean;
  uiTarget: "en" | "he";
  expanded: Record<string, boolean>;
  onExpandedChange: (updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
}) {
  const isSentView = folder === "sent";
  const [entryTranslations, setEntryTranslations] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const translateEntryMutation = useMutation({
    mutationFn: async ({ text, target }: { text: string; target: "en" | "he" }) => {
      const res = await apiRequest("POST", `/api/admin/inbox/translate`, { text, target });
      return (await res.json()).translated as string;
    },
  });
  const { toast } = useToast();
  const handleTranslateEntry = async (entry: ThreadEntry) => {
    if (entryTranslations[entry.id]) {
      setEntryTranslations((p) => {
        const next = { ...p };
        delete next[entry.id];
        return next;
      });
      return;
    }
    setTranslatingId(entry.id);
    try {
      const out = await translateEntryMutation.mutateAsync({ text: entry.body, target: uiTarget });
      setEntryTranslations((p) => ({ ...p, [entry.id]: out }));
    } catch (e) {
      toast({ title: "Translate failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setTranslatingId(null);
    }
  };
  const ref = selected.source === "email"
    ? String(selected.threadId || selected.id)
    : String(selected.id);
  const query = useQuery<ThreadResponse>({
    queryKey: ["/api/admin/inbox/thread", selected.source, ref],
    queryFn: async () => {
      const params = new URLSearchParams({ source: selected.source, ref });
      const res = await fetch(`/api/admin/inbox/thread?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load conversation");
      return res.json();
    },
  });

  const fallbackEntry: ThreadEntry = useMemo(() => ({
    id: `${selected.source}:${selected.id}`,
    direction: isSentView ? "outbound" : "inbound",
    from: selected.fromEmail
      ? `${selected.fromName} <${selected.fromEmail}>`
      : selected.fromName,
    to: isSentView ? selected.toAddress : undefined,
    subject: selected.subject,
    body: selected.body,
    date: safeDate(selected.date),
    isRead: selected.isRead,
    source: selected.source === "email" ? "gmail" : "form",
    messageRef: String(selected.id),
  }), [selected, isSentView]);

  const messages: ThreadEntry[] = query.data?.messages?.length
    ? query.data.messages
    : [fallbackEntry];

  const currentRef = String(selected.id);
  const isCurrent = (m: ThreadEntry) => {
    if (selected.source === "email") return m.source === "gmail" && m.messageRef === currentRef;
    return m.source === "form" && m.messageRef === currentRef;
  };
  const latestIdx = messages.length - 1;

  const isExpanded = (m: ThreadEntry, idx: number) => {
    if (m.id in expanded) return expanded[m.id];
    return isCurrent(m) || idx === latestIdx;
  };
  const toggle = (id: string, current: boolean) =>
    onExpandedChange((p) => ({ ...p, [id]: !current }));

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      setShowJump(false);
    }
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setShowJump(false);
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJump(distanceFromBottom > 80);
  }, []);

  const repliedAt = useMemo(() => {
    const outbound = messages.filter((m) => m.direction === "outbound");
    if (!outbound.length) return null;
    return outbound[outbound.length - 1].date;
  }, [messages]);

  return (
    <Card className="mb-6" data-testid="panel-thread-transcript">
      <CardHeader>
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-xl truncate" data-testid="text-thread-subject">
                {selected.subject || t("noSubject")}
              </CardTitle>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] py-0 h-5 font-medium tabular-nums" data-testid="badge-thread-message-count">
                  {messages.length === 1
                    ? t("inboxThreadCountSingle")
                    : t("inboxThreadCountMany").replace("{count}", String(messages.length))}
                </Badge>
                {query.isLoading && (
                  <span className="text-xs text-muted-foreground" data-testid="text-thread-loading">
                    {t("inboxLoadingThread")}
                  </span>
                )}
                {query.isError && (
                  <span className="flex items-center gap-2" data-testid="text-thread-error">
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      {t("inboxThreadLoadFailed")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => query.refetch()}
                      data-testid="button-thread-retry"
                    >
                      {t("inboxRetry")}
                    </Button>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {repliedAt && (
                <Badge
                  variant="outline"
                  className="border-green-600 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300 dark:border-green-700 font-semibold"
                  data-testid="badge-replied-detail"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  {t("inboxRepliedOn").replace("{date}", formatDate(repliedAt))}
                </Badge>
              )}
              <span
                className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground"
                data-testid={`source-tag-detail-${selected.source}`}
              >
                {selected.source === "email"
                  ? <Mail className="h-3.5 w-3.5" />
                  : <MessageSquare className="h-3.5 w-3.5" />}
                {selected.source === "email" ? t("inboxSourceEmail") : t("inboxSourceForm")}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="relative max-h-[480px] overflow-y-auto space-y-3 pr-1"
          data-testid="thread-scroll-container"
        >
        {messages.length === 1 && !query.isLoading && (
          <div className="text-xs text-muted-foreground italic" data-testid="text-thread-only-message">
            {t("inboxThreadOnlyMessage")}
          </div>
        )}
        {messages.map((m, idx) => {
          const open = isExpanded(m, idx);
          const outbound = m.direction === "outbound";
          const showTranslate = !outbound;
          const isLatestInbound = isCurrent(m);
          const entryTranslated = isLatestInbound
            ? translatedBody
            : entryTranslations[m.id] ?? null;
          const isThisTranslating = isLatestInbound
            ? isTranslating
            : translatingId === m.id;
          const body = showTranslate && entryTranslated ? entryTranslated : m.body;
          return (
            <div
              key={m.id}
              className={`rounded-md border ${
                outbound
                  ? "bg-blue-50/60 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900"
                  : "bg-muted/20 border-border"
              } ${isCurrent(m) ? "ring-1 ring-primary/50" : ""}`}
              data-testid={`thread-entry-${m.id}`}
            >
              <button
                type="button"
                onClick={() => toggle(m.id, open)}
                className="w-full flex items-center justify-between gap-3 p-3 text-left hover-elevate"
                data-testid={`thread-entry-toggle-${m.id}`}
                aria-expanded={open}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 h-5 uppercase tracking-wide ${
                      outbound
                        ? "border-blue-600 text-blue-800 dark:text-blue-300"
                        : "border-muted-foreground/40 text-muted-foreground"
                    }`}
                    data-testid={`thread-entry-direction-${m.id}`}
                  >
                    {outbound ? t("inboxThreadOutbound") : t("inboxThreadInbound")}
                  </Badge>
                  {outbound ? (
                    <>
                      <span className="text-xs text-muted-foreground flex-shrink-0">To:</span>
                      <span
                        className="font-medium truncate text-sm"
                        title={m.to || selected.toAddress || undefined}
                        data-testid={`thread-entry-to-${m.id}`}
                      >
                        {(() => {
                          const raw = m.to || selected.toAddress;
                          if (!raw) return "—";
                          const p = parseEmailAddress(raw);
                          if (p.name && p.email) return `${p.name} <${p.email}>`;
                          return p.email || p.name || raw;
                        })()}
                      </span>
                    </>
                  ) : (
                    <span className="font-medium truncate text-sm" data-testid={`thread-entry-from-${m.id}`}>
                      {m.from || "—"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span data-testid={`thread-entry-date-${m.id}`}>{formatDate(m.date)}</span>
                  {open
                    ? <ChevronUp className="h-3.5 w-3.5" />
                    : <ChevronDown className="h-3.5 w-3.5" />}
                </div>
              </button>
              {open && (
                <div className="px-3 pb-3" data-testid={`thread-entry-body-${m.id}`}>
                  <div
                    className="whitespace-pre-wrap text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
                  />
                  {showTranslate && (
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => isLatestInbound ? onTranslateLatestInbound() : handleTranslateEntry(m)}
                        disabled={isThisTranslating}
                        data-testid={isLatestInbound ? "button-translate-message" : `button-translate-entry-${m.id}`}
                      >
                        <Languages className="h-4 w-4 mr-2" />
                        {entryTranslated ? t("inboxShowOriginal") : t("inboxTranslate")}
                      </Button>
                      {entryTranslated && (
                        <span className="text-xs text-muted-foreground">{t("inboxTranslated")}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </div>
        {showJump && (
          <div className="flex justify-center mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={jumpToLatest}
              className="gap-1.5 text-xs"
              data-testid="button-jump-to-latest"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              {t("inboxJumpToLatest")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
