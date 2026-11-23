import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  ImagePlus,
  Link2,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  clearAllHomepageSlides,
  compressImageFileToDataUrl,
  createHomepageSlide,
  deleteHomepageSlide,
  isValidSlideImageSource,
  swapHomepageSlideOrder,
  updateHomepageSlide,
} from '../lib/firestoreActions';
import type { HomepageSlide, Language } from '../types/oilcom';

export const DEFAULT_HERO_TANKER_PHOTO =
  '/assets/aistudio/WhatsApp_Image_2026-11-21_at_11.41.08_PM__1__e4bdacfd.jpeg';

interface HomepageSlidesManagerProps {
  lang: Language;
  slides: HomepageSlide[];
  compact?: boolean;
}

export function HomepageSlidesManager({
  lang,
  slides,
  compact = false,
}: HomepageSlidesManagerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkCaption, setLinkCaption] = useState('');
  const [linkPreviewError, setLinkPreviewError] = useState(false);

  const [uploadingState, setUploadingState] = useState<string | null>(null);
  const [savingLink, setSavingLink] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sortedSlides = useMemo(
    () =>
      [...slides].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id.localeCompare(b.id);
      }),
    [slides]
  );

  const activeCount = useMemo(
    () => sortedSlides.filter((s) => s.active).length,
    [sortedSlides]
  );

  const nextSortOrder = useMemo(() => {
    if (sortedSlides.length === 0) return 10;
    return Math.max(...sortedSlides.map((s) => s.sortOrder || 0)) + 10;
  }, [sortedSlides]);

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    setStatusMsg(null);
    let currentOrder = nextSortOrder;
    let uploadedCount = 0;

    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setUploadingState(
          lang === 'sw'
            ? `Inapakia picha ${i + 1} kati ya ${files.length}...`
            : `Uploading image ${i + 1} of ${files.length}...`
        );
        const compressedUrl = await compressImageFileToDataUrl(file);
        const baseName = file.name.replace(/\.[^/.]+$/, '').slice(0, 60);
        await createHomepageSlide({
          imageUrl: compressedUrl,
          title: baseName || (lang === 'sw' ? 'Picha ya OILCOM' : 'OILCOM Banner'),
          caption: '',
          sortOrder: currentOrder,
          active: true,
        });
        currentOrder += 10;
        uploadedCount += 1;
      }

      setStatusMsg({
        type: 'ok',
        text:
          lang === 'sw'
            ? `Picha ${uploadedCount} zimepakiwa na zinaonekana kwenye Homepage.`
            : `${uploadedCount} photo(s) uploaded and live on Homepage.`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : lang === 'sw'
              ? 'Imeshindwa kupakia picha.'
              : 'Failed to upload image.',
      });
    } finally {
      setUploadingState(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const trimmed = linkUrl.trim();
    if (!isValidSlideImageSource(trimmed)) {
      setStatusMsg({
        type: 'err',
        text:
          lang === 'sw'
            ? 'Weka linki sahihi ya picha inayoanza na https:// au http://'
            : 'Please enter a valid image URL starting with https:// or http://',
      });
      return;
    }

    setSavingLink(true);
    try {
      await createHomepageSlide({
        imageUrl: trimmed,
        title: linkTitle.trim(),
        caption: linkCaption.trim(),
        sortOrder: nextSortOrder,
        active: true,
      });
      setLinkUrl('');
      setLinkTitle('');
      setLinkCaption('');
      setLinkPreviewError(false);
      setStatusMsg({
        type: 'ok',
        text:
          lang === 'sw'
            ? 'Linki ya picha imeongezwa kwenye Homepage.'
            : 'Image link added to Homepage.',
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : lang === 'sw'
              ? 'Imeshindwa kuhifadhi linki ya picha.'
              : 'Failed to save image link.',
      });
    } finally {
      setSavingLink(false);
    }
  };

  const startEdit = (slide: HomepageSlide) => {
    setEditingId(slide.id);
    setEditTitle(slide.title || '');
    setEditCaption(slide.caption || '');
    setEditUrl(slide.imageUrl.startsWith('data:') ? '' : slide.imageUrl);
    setStatusMsg(null);
  };

  const saveEdit = async (slide: HomepageSlide) => {
    setBusyId(slide.id);
    setStatusMsg(null);
    try {
      const patch: {
        title: string;
        caption: string;
        imageUrl?: string;
      } = {
        title: editTitle,
        caption: editCaption,
      };
      if (!slide.imageUrl.startsWith('data:') && editUrl.trim()) {
        patch.imageUrl = editUrl.trim();
      }
      await updateHomepageSlide(slide.id, patch);
      setEditingId(null);
      setStatusMsg({
        type: 'ok',
        text: lang === 'sw' ? 'Mabadiliko yamehifadhiwa.' : 'Slide updated.',
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Update failed',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (slide: HomepageSlide) => {
    setBusyId(slide.id);
    try {
      await updateHomepageSlide(slide.id, { active: !slide.active });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update visibility',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (slideId: string) => {
    setBusyId(slideId);
    try {
      await deleteHomepageSlide(slideId);
      setStatusMsg({
        type: 'ok',
        text: lang === 'sw' ? 'Picha imeondolewa.' : 'Slide removed.',
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to delete slide',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= sortedSlides.length) return;
    const current = sortedSlides[index];
    const neighbor = sortedSlides[targetIdx];
    setBusyId(current.id);
    try {
      await swapHomepageSlideOrder(current, neighbor);
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to reorder slides',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleClearAll = async () => {
    setBusyId('clear-all');
    try {
      await clearAllHomepageSlides(sortedSlides);
      setConfirmClear(false);
      setStatusMsg({
        type: 'ok',
        text:
          lang === 'sw'
            ? 'Homepage imerudi kutumia picha ya asili ya OILCOM.'
            : 'Homepage restored to default OILCOM banner.',
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to reset slides',
      });
    } finally {
      setBusyId(null);
    }
  };

  const linkValid = isValidSlideImageSource(linkUrl.trim());

  return (
    <div className="space-y-4">
      {/* Summary Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-neutral-50 dark:bg-[#091022] border border-neutral-200 dark:border-blue-950 p-3.5">
        <div className="min-w-0">
          <p className="font-display font-bold text-sm text-neutral-900 dark:text-white">
            {activeCount === 0
              ? lang === 'sw'
                ? 'Inaonyesha: Picha ya Asili (Default OILCOM)'
                : 'Displaying: Default OILCOM Banner'
              : activeCount === 1
                ? lang === 'sw'
                  ? 'Inaonyesha: Picha 1 Maalum (Static)'
                  : 'Displaying: 1 Custom Photo'
                : lang === 'sw'
                  ? `Inaonyesha: Slideshow ya Picha ${activeCount}`
                  : `Displaying: ${activeCount}-Photo Slideshow`}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            {lang === 'sw'
              ? 'Unaweza kupakia picha moja au nyingi kutoka kifaa chako, au kuweka linki ya picha (https://...). Wageni wote wanaiona kabla hata ya kuingia.'
              : 'Upload one or multiple photos from your device, or paste image links (https://...). Immediately visible on the public homepage before login.'}
          </p>
        </div>
        {sortedSlides.length > 0 && (
          <div className="shrink-0">
            {confirmClear ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busyId === 'clear-all'}
                  onClick={handleClearAll}
                  className="px-3 py-1.5 rounded-lg bg-[#D92027] text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {lang === 'sw' ? 'Thibitisha Futa Zote' : 'Confirm Reset'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-blue-800 text-xs font-semibold cursor-pointer"
                >
                  {lang === 'sw' ? 'Ghairi' : 'Cancel'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 hover:border-[#D92027] text-xs font-semibold text-neutral-700 dark:text-neutral-200 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{lang === 'sw' ? 'Rudisha ya Asili' : 'Use Default'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {statusMsg && (
        <div
          className={`rounded-xl px-3.5 py-2.5 text-xs font-semibold border ${
            statusMsg.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Two Input Methods Grid: Upload Files vs Paste Image URL */}
      <div className={`grid grid-cols-1 ${compact ? 'md:grid-cols-2' : 'lg:grid-cols-2'} gap-4`}>
        {/* Method 1: Upload Image(s) from Device */}
        <div className="rounded-xl border border-dashed border-[#0B2A6F]/35 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/25 p-4 flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#0B2A6F] text-[#F5B800] flex items-center justify-center shrink-0">
                <Upload className="w-4 h-4" />
              </div>
              <h4 className="font-display font-bold text-sm text-neutral-900 dark:text-white">
                {lang === 'sw' ? 'Pakia Picha (Moja au Nyingi)' : 'Upload Photo(s) from Device'}
              </h4>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              {lang === 'sw'
                ? 'Chagua picha moja kubadilisha moja kwa moja, au chagua picha nyingi kwa pamoja kutengeneza slideshow.'
                : 'Select one image to replace the hero photo, or pick multiple photos at once to create a slideshow.'}
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />

          <button
            type="button"
            disabled={Boolean(uploadingState)}
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 px-4 rounded-xl bg-[#0B2A6F] hover:bg-[#092259] text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
          >
            <ImagePlus className="w-4 h-4 text-[#F5B800]" />
            <span>
              {uploadingState ||
                (lang === 'sw' ? 'Chagua & Pakia Picha...' : 'Select & Upload Photo(s)...')}
            </span>
          </button>
        </div>

        {/* Method 2: Paste Image Link (URL) */}
        <form
          onSubmit={handleAddLink}
          className="rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50/70 dark:bg-[#091022] p-4 space-y-2.5"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#D92027] text-white flex items-center justify-center shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <h4 className="font-display font-bold text-sm text-neutral-900 dark:text-white">
              {lang === 'sw' ? 'Au Weka Linki ya Picha (URL)' : 'Or Paste an Image Link (URL)'}
            </h4>
          </div>

          <div>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                setLinkPreviewError(false);
              }}
              placeholder="https://example.com/oilcom-station.jpg"
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-blue-950 bg-white dark:bg-[#0E172E] text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              maxLength={120}
              placeholder={lang === 'sw' ? 'Kichwa (hiari)' : 'Title (optional)'}
              className="w-full px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-950 bg-white dark:bg-[#0E172E] text-xs"
            />
            <input
              type="text"
              value={linkCaption}
              onChange={(e) => setLinkCaption(e.target.value)}
              maxLength={200}
              placeholder={lang === 'sw' ? 'Maelezo mafupi (hiari)' : 'Caption (optional)'}
              className="w-full px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-950 bg-white dark:bg-[#0E172E] text-xs"
            />
          </div>

          {linkValid && (
            <div className="rounded-lg overflow-hidden border border-neutral-200 dark:border-blue-900 bg-black/5 h-24 relative flex items-center justify-center">
              {!linkPreviewError ? (
                <img
                  src={linkUrl.trim()}
                  alt="Preview"
                  referrerPolicy="no-referrer"
                  onError={() => setLinkPreviewError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[11px] text-amber-700 dark:text-amber-300 px-3 text-center">
                  {lang === 'sw'
                    ? 'Picha haikuonekana kwenye preview — hakikisha linki inamalizikia au ina ruhusa ya kuonekana.'
                    : 'Preview could not load — verify this URL directly serves an image.'}
                </span>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={savingLink || !linkUrl.trim()}
            className="w-full py-2 px-4 rounded-xl bg-[#D92027] hover:bg-[#b81b21] text-white text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors"
          >
            {savingLink
              ? lang === 'sw'
                ? 'Inahifadhi...'
                : 'Saving...'
              : lang === 'sw'
                ? 'Ongeza Linki Kwenye Homepage'
                : 'Add Image Link to Homepage'}
          </button>
        </form>
      </div>

      {/* Existing Slides List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {lang === 'sw'
              ? `Picha Zilizowekwa (${sortedSlides.length})`
              : `Configured Slides (${sortedSlides.length})`}
          </h4>
          {sortedSlides.length > 1 && (
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {lang === 'sw'
                ? 'Tumia mishale kupanga mpangilio'
                : 'Use arrows to reorder slideshow'}
            </span>
          )}
        </div>

        {sortedSlides.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 dark:border-blue-950 p-3 flex items-center gap-3 bg-neutral-50 dark:bg-[#091022]">
            <img
              src={DEFAULT_HERO_TANKER_PHOTO}
              alt="Default OILCOM Tanker"
              className="w-20 h-14 rounded-lg object-cover shrink-0 border border-neutral-200 dark:border-blue-900"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold text-neutral-900 dark:text-white">
                {lang === 'sw'
                  ? 'Picha ya Asili ya OILCOM Inatumika'
                  : 'Default OILCOM Banner Active'}
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {lang === 'sw'
                  ? 'Pakia picha au weka linki hapo juu ili kuibadilisha au kuunda slideshow.'
                  : 'Upload photos or paste a link above to replace it or build a multi-photo slideshow.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedSlides.map((slide, idx) => {
              const isEditing = editingId === slide.id;
              const isBusy = busyId === slide.id;

              return (
                <div
                  key={slide.id}
                  className={`rounded-xl border p-3 transition-colors ${
                    slide.active
                      ? 'border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#091022]'
                      : 'border-neutral-200/70 dark:border-blue-950 bg-neutral-100/70 dark:bg-[#070C1A] opacity-75'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative w-full sm:w-28 h-28 sm:h-16 rounded-lg overflow-hidden bg-neutral-200 dark:bg-blue-950 shrink-0">
                      <img
                        src={slide.imageUrl}
                        alt={slide.title || `Slide ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-white font-mono-num text-[10px] font-bold">
                        #{idx + 1}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="flex-1 space-y-2 min-w-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            maxLength={120}
                            placeholder={lang === 'sw' ? 'Kichwa' : 'Title'}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-blue-800 bg-white dark:bg-[#0E172E] text-xs"
                          />
                          <input
                            type="text"
                            value={editCaption}
                            onChange={(e) => setEditCaption(e.target.value)}
                            maxLength={200}
                            placeholder={lang === 'sw' ? 'Maelezo mafupi' : 'Caption'}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-blue-800 bg-white dark:bg-[#0E172E] text-xs"
                          />
                        </div>
                        {!slide.imageUrl.startsWith('data:') && (
                          <input
                            type="url"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            placeholder="https://..."
                            className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-blue-800 bg-white dark:bg-[#0E172E] text-xs"
                          />
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => saveEdit(slide)}
                            className="px-3 py-1 rounded-lg bg-[#0B2A6F] text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{lang === 'sw' ? 'Hifadhi' : 'Save'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 rounded-lg border border-neutral-300 dark:border-blue-800 text-xs font-semibold cursor-pointer"
                          >
                            {lang === 'sw' ? 'Ghairi' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-xs sm:text-sm text-neutral-900 dark:text-white truncate">
                            {slide.title ||
                              (lang === 'sw' ? `Picha #${idx + 1}` : `Slide #${idx + 1}`)}
                          </p>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              slide.active
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                            }`}
                          >
                            {slide.active
                              ? lang === 'sw'
                                ? 'Inaonekana'
                                : 'Visible'
                              : lang === 'sw'
                                ? 'Imefichwa'
                                : 'Hidden'}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                          {slide.caption ||
                            (slide.imageUrl.startsWith('data:')
                              ? lang === 'sw'
                                ? 'Picha iliyopakiwa moja kwa moja'
                                : 'Uploaded image file'
                              : slide.imageUrl)}
                        </p>
                      </div>
                    )}

                    {!isEditing && (
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        <button
                          type="button"
                          disabled={isBusy || idx === 0}
                          onClick={() => handleMove(idx, -1)}
                          aria-label="Move up"
                          title={lang === 'sw' ? 'Sogeza Juu' : 'Move Up'}
                          className="p-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 hover:bg-neutral-100 dark:hover:bg-blue-950 disabled:opacity-35 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isBusy || idx === sortedSlides.length - 1}
                          onClick={() => handleMove(idx, 1)}
                          aria-label="Move down"
                          title={lang === 'sw' ? 'Sogeza Chini' : 'Move Down'}
                          className="p-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 hover:bg-neutral-100 dark:hover:bg-blue-950 disabled:opacity-35 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleActive(slide)}
                          aria-label={slide.active ? 'Hide slide' : 'Show slide'}
                          title={
                            slide.active
                              ? lang === 'sw'
                                ? 'Ficha'
                                : 'Hide'
                              : lang === 'sw'
                                ? 'Onyesha'
                                : 'Show'
                          }
                          className="p-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 hover:bg-neutral-100 dark:hover:bg-blue-950 cursor-pointer"
                        >
                          {slide.active ? (
                            <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-neutral-400" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => startEdit(slide)}
                          aria-label="Edit slide"
                          title={lang === 'sw' ? 'Hariri' : 'Edit'}
                          className="p-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 hover:bg-neutral-100 dark:hover:bg-blue-950 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-[#0B2A6F] dark:text-[#F5B800]" />
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDelete(slide.id)}
                          aria-label="Delete slide"
                          title={lang === 'sw' ? 'Futa' : 'Delete'}
                          className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface HomepageSlidesManagerModalProps {
  open: boolean;
  lang: Language;
  slides: HomepageSlide[];
  onClose: () => void;
}

export function HomepageSlidesManagerModal({
  open,
  lang,
  slides,
  onClose,
}: HomepageSlidesManagerModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-900 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#0B2A6F] text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#F5B800]">
              Admin Media Manager
            </p>
            <h3 className="font-display font-bold text-base sm:text-lg">
              {lang === 'sw'
                ? 'Badilisha Picha za Homepage'
                : 'Manage Homepage Hero Photos'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close media manager"
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <HomepageSlidesManager lang={lang} slides={slides} compact />
        </div>

        <div className="px-5 py-3 border-t border-neutral-200 dark:border-blue-950 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#0B2A6F] text-white text-xs font-bold cursor-pointer"
          >
            {lang === 'sw' ? 'Maliza' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
