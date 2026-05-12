/**
 * PostCaptureScreen.tsx  (v6)
 *
 * VIDEO:  VideoEditorPanel owns the full screen — 16:9 player at top,
 *         timeline + controls scroll below. No static thumbnail.
 * PHOTO:  Preview + tabbed editor as before.
 */

import React, { memo, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Platform, ActivityIndicator,
} from 'react-native';
import { captureRef }        from 'react-native-view-shot';
import * as ImageManipulator from 'expo-image-manipulator';

import { CameraResult }                          from './types';
import { useEditorState, EditorTab, AdjustState } from '../../hooks/useEditorState';
import { useSkiaImage }                          from './SkiaFilterRenderer';
import SkiaFilterRenderer                        from './SkiaFilterRenderer';
import CropPanel                                 from './CropPanel';
import CropOverlay, { NormBox }                  from './CropOverlay';
import AdjustPanel                               from './AdjustmentPanel';
import VideoEditorPanel, { VideoEditorHandle }   from './VideoEditorPanel';

import { AURAS, AURA_MAP }  from '../../constants/auras';
import { SkiaFilterPreset } from '../../constants/FilterPresets';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PostCaptureScreenProps {
  capturedMedia:  CameraResult;
  onConfirm:      (result: CameraResult) => void;
  onRetake:       () => void;
  videoDuration?: number;
}

interface TabDef {
  id:         EditorTab;
  icon:       string;
  label:      string;
  photoOnly?: boolean;
}

const PHOTO_TABS: TabDef[] = [
  { id: 'filters', icon: '✦', label: 'Filters' },
  { id: 'adjust',  icon: '⊙', label: 'Adjust'  },
  { id: 'crop',    icon: '⊡', label: 'Crop'    },
  { id: 'text',    icon: 'T',  label: 'Text'    },
  { id: 'draw',    icon: '✏', label: 'Draw'    },
];

const THUMB_SIZE = 64;

function adjustToPreset(adj: AdjustState): Partial<SkiaFilterPreset> {
  const p: Partial<SkiaFilterPreset> = {};
  if (adj.warmth     !== 0) p.warmth     = adj.warmth;
  if (adj.saturation !== 0) p.saturation = 1 + adj.saturation;
  if (adj.contrast   !== 0) p.contrast   = 1 + adj.contrast;
  if (adj.sharpness  !== 0) p.sharpen    = { amount: Math.max(0, adj.sharpness) };
  if (adj.fade       !== 0) p.lift       = { amount: Math.max(0, adj.fade) * 0.1, fade: Math.max(0, adj.fade) * 0.25 };
  if (adj.highlights !== 0 || adj.shadows !== 0 || adj.brightness !== 0) {
    p.tone = {
      highlights: (adj.highlights + adj.brightness * 0.5) * 0.3,
      shadows:    (adj.shadows    + adj.brightness * 0.3) * 0.3,
    };
  }
  return p;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PostCaptureScreen = memo(({
  capturedMedia, onConfirm, onRetake, videoDuration = 0,
}: PostCaptureScreenProps) => {
  const isVideo = capturedMedia.type === 'video';

  const editor         = useEditorState();
  const { state }      = editor;

  const [isSaving,    setIsSaving]    = useState(false);
  const [previewSize, setPreviewSize] = useState({ width: 1, height: 1 });

  const previewRef     = useRef<View>(null);
  const cropBoxRef     = useRef<NormBox>({ x: 0, y: 0, w: 1, h: 1 });
  const videoEditorRef = useRef<VideoEditorHandle | null>(null);

  const skImage = useSkiaImage(isVideo ? null : capturedMedia.uri);

  const activePreset = useMemo((): SkiaFilterPreset | null => {
    const auraBase = state.selectedAuraId ? AURA_MAP.get(state.selectedAuraId)?.preset ?? null : null;
    const patch    = adjustToPreset(state.adjust);
    if (!auraBase && Object.keys(patch).length === 0) return null;
    const base: SkiaFilterPreset = auraBase ?? { id: '_adj', name: 'Adjust', category: 'portrait', previewTint: '#FFF' };
    return { ...base, ...patch };
  }, [state.selectedAuraId, state.adjust]);

  const previewTransform = useMemo(() => {
    const t: object[] = [];
    if (state.crop.rotation !== 0) t.push({ rotate: `${state.crop.rotation}deg` });
    if (state.crop.flipH)          t.push({ scaleX: -1 });
    if (state.crop.flipV)          t.push({ scaleY: -1 });
    return t;
  }, [state.crop.rotation, state.crop.flipH, state.crop.flipV]);

  // ── Confirm ───────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (isVideo) {
      try {
        setIsSaving(true);
        if (videoEditorRef.current && videoEditorRef.current.hasEdits) {
          const uri = await videoEditorRef.current.processVideo();
          onConfirm({ ...capturedMedia, uri });
        } else {
          onConfirm(capturedMedia);
        }
      } catch (err) {
        console.error('[PostCaptureScreen] video error:', err);
        onConfirm(capturedMedia);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    try {
      setIsSaving(true);
      const actions: ImageManipulator.Action[] = [];
      const imgW = skImage?.width()  ?? previewSize.width;
      const imgH = skImage?.height() ?? previewSize.height;
      const nb   = cropBoxRef.current;
      const cx = Math.round(nb.x * imgW), cy = Math.round(nb.y * imgH);
      const cw = Math.round(nb.w * imgW), ch = Math.round(nb.h * imgH);
      if (!(cx <= 2 && cy <= 2 && cw >= imgW - 4 && ch >= imgH - 4)) {
        actions.push({ crop: { originX: cx, originY: cy, width: Math.max(1, cw), height: Math.max(1, ch) } });
      }
      if (state.crop.rotation !== 0) actions.push({ rotate: state.crop.rotation });
      if (state.crop.flipH) actions.push({ flip: ImageManipulator.FlipType.Horizontal });
      if (state.crop.flipV) actions.push({ flip: ImageManipulator.FlipType.Vertical });

      let workingUri = capturedMedia.uri;
      if (actions.length > 0) {
        const r = await ImageManipulator.manipulateAsync(capturedMedia.uri, actions, { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG });
        workingUri = r.uri;
      }

      if (activePreset) {
        const filteredUri = await captureRef(previewRef, { format: 'jpg', quality: 0.92, result: 'tmpfile' });
        onConfirm({ ...capturedMedia, uri: filteredUri });
      } else {
        onConfirm({ ...capturedMedia, uri: workingUri });
      }
    } catch (err) {
      console.error('[PostCaptureScreen] photo error:', err);
      onConfirm(capturedMedia);
    } finally {
      setIsSaving(false);
    }
  }, [capturedMedia, isVideo, state.crop, activePreset, skImage, previewSize, onConfirm]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>

      {isVideo ? (
        /* ── VIDEO — full screen editor ─────────────────────────────── */
        <View style={s.root}>
          {/* Top bar floats over the video player */}
          <SafeAreaView style={s.videoTopBar} pointerEvents="box-none">
            <TouchableOpacity style={s.retakeBtn} onPress={onRetake} disabled={isSaving} activeOpacity={0.8}>
              <Text style={s.retakeTxt}>↩ Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.useVideoBtn, isSaving && s.useBtnDisabled]}
              onPress={handleConfirm}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              {isSaving
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={s.useVideoBtnTxt}>Use Video</Text>
              }
            </TouchableOpacity>
          </SafeAreaView>

          <VideoEditorPanel
            ref={videoEditorRef}
            uri={capturedMedia.uri}
            duration={videoDuration}
          />
        </View>

      ) : (
        /* ── PHOTO — preview + tabbed editor ────────────────────────── */
        <>
          <View
            style={s.previewArea}
            onLayout={e => {
              const { width, height } = e.nativeEvent.layout;
              setPreviewSize({ width, height });
            }}
          >
            <View
              ref={previewRef}
              collapsable={false}
              style={[StyleSheet.absoluteFill, previewTransform.length ? { transform: previewTransform } : undefined]}
            >
              {skImage ? (
                <SkiaFilterRenderer image={skImage} width={previewSize.width} height={previewSize.height} preset={activePreset} />
              ) : (
                <Image source={{ uri: capturedMedia.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              )}
            </View>

            {state.activeTab === 'crop' && previewSize.width > 1 && (
              <CropOverlay
                containerWidth={previewSize.width}
                containerHeight={previewSize.height}
                ratio={state.crop.ratio}
                onCommit={box => { cropBoxRef.current = box; }}
              />
            )}

            <SafeAreaView style={s.topBar} pointerEvents="box-none">
              <TouchableOpacity style={s.retakeBtn} onPress={onRetake} disabled={isSaving} activeOpacity={0.8}>
                <Text style={s.retakeTxt}>↩ Retake</Text>
              </TouchableOpacity>
              {state.selectedAuraId && (
                <View style={s.auraBadge}>
                  <Text style={s.auraBadgeTxt}>
                    {AURA_MAP.get(state.selectedAuraId)?.emoji}{' '}
                    {AURA_MAP.get(state.selectedAuraId)?.name}
                  </Text>
                </View>
              )}
            </SafeAreaView>

            {isSaving && (
              <View style={s.savingOverlay}>
                <ActivityIndicator size="large" color="#FFF" />
                <Text style={s.savingTxt}>Saving…</Text>
              </View>
            )}
          </View>

          <View style={s.bottomPanel}>
            <View style={s.tabBar}>
              {PHOTO_TABS.map(tab => {
                const active = state.activeTab === tab.id;
                return (
                  <TouchableOpacity key={tab.id} style={s.tabBtn} onPress={() => editor.setActiveTab(tab.id)} activeOpacity={0.7}>
                    <Text style={[s.tabIcon,  active && s.tabIconActive ]}>{tab.icon}</Text>
                    <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab.label}</Text>
                    {active && <View style={s.tabIndicator} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.panelArea}>
              {state.activeTab === 'filters' && (
                <AuraFilterPanel selectedId={state.selectedAuraId} skImage={skImage} onSelect={editor.setSelectedAura} />
              )}
              {state.activeTab === 'adjust' && (
                <AdjustPanel adjust={state.adjust} onChange={editor.setAdjust} onReset={editor.resetAdjust} />
              )}
              {state.activeTab === 'crop' && (
                <CropPanel crop={state.crop} onSetRatio={editor.setRatio} onRotateRight={editor.rotateRight} onFlipH={editor.flipH} onFlipV={editor.flipV} onReset={editor.resetCrop} />
              )}
              {state.activeTab === 'text' && <ComingSoon label="Text overlays" icon="T"  />}
              {state.activeTab === 'draw' && <ComingSoon label="Draw & doodle" icon="✏" />}
            </View>

            <SafeAreaView style={s.useBar}>
              <TouchableOpacity style={[s.useBtn, isSaving && s.useBtnDisabled]} onPress={handleConfirm} activeOpacity={0.85} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#000" /> : <Text style={s.useBtnTxt}>Use Photo</Text>}
              </TouchableOpacity>
            </SafeAreaView>
          </View>
        </>
      )}

    </View>
  );
});

PostCaptureScreen.displayName = 'PostCaptureScreen';
export default PostCaptureScreen;

// ─── AuraFilterPanel ──────────────────────────────────────────────────────────

const CAT_ORDER  = ['portrait', 'cinematic', 'film', 'mood'] as const;
const CAT_LABELS: Record<string, string> = { portrait: 'Portrait', cinematic: 'Cinematic', film: 'Film', mood: 'Mood' };

function AuraFilterPanel({ selectedId, skImage, onSelect }: { selectedId: string | null; skImage: ReturnType<typeof useSkiaImage>; onSelect: (id: string | null) => void }) {
  const [activeCat, setActiveCat] = useState('portrait');
  const visible = AURAS.filter(a => a.preset.category === activeCat);
  return (
    <View style={fp.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fp.catRow} bounces={false}>
        <TouchableOpacity style={[fp.catTab, !selectedId && fp.catTabActive]} onPress={() => onSelect(null)} activeOpacity={0.7}>
          <Text style={[fp.catLabel, !selectedId && fp.catLabelActive]}>None</Text>
        </TouchableOpacity>
        {CAT_ORDER.map(cat => (
          <TouchableOpacity key={cat} style={[fp.catTab, activeCat === cat && fp.catTabActive]} onPress={() => setActiveCat(cat)} activeOpacity={0.7}>
            <Text style={[fp.catLabel, activeCat === cat && fp.catLabelActive]}>{CAT_LABELS[cat]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fp.thumbRow} bounces={false}>
        {visible.map(aura => {
          const sel = aura.id === selectedId;
          return (
            <TouchableOpacity key={aura.id} style={fp.thumbItem} onPress={() => onSelect(sel ? null : aura.id)} activeOpacity={0.8}>
              <View style={[fp.thumbWrap, sel && fp.thumbWrapSelected]}>
                {skImage ? <SkiaFilterRenderer image={skImage} width={THUMB_SIZE} height={THUMB_SIZE} preset={aura.preset} /> : <View style={[fp.swatch, { backgroundColor: aura.swatchColor }]} />}
                <Text style={fp.thumbEmoji}>{aura.emoji}</Text>
              </View>
              <Text style={[fp.thumbName, sel && fp.thumbNameSel]} numberOfLines={1}>{aura.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ComingSoon({ label, icon }: { label: string; icon: string }) {
  return (
    <View style={cs.wrap}>
      <Text style={cs.icon}>{icon}</Text>
      <Text style={cs.label}>{label}</Text>
      <Text style={cs.sub}>Coming soon</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: '#000' },
  previewArea:     { flex: 1, backgroundColor: '#000', overflow: 'hidden' },

  // Video top bar — floats over the 16:9 player
  videoTopBar:     { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 16 : 8 },
  useVideoBtn:     { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF' },
  useVideoBtnTxt:  { fontSize: 14, fontWeight: '700', color: '#000' },

  topBar:          { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 16 : 4 },
  retakeBtn:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)' },
  retakeTxt:       { fontSize: 14, fontWeight: '600', color: '#FFF' },
  auraBadge:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.55)' },
  auraBadgeTxt:    { fontSize: 13, fontWeight: '600', color: '#FFF', letterSpacing: 0.4 },
  savingOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  savingTxt:       { fontSize: 15, color: '#FFF', fontWeight: '500' },

  bottomPanel:     { backgroundColor: '#111' },
  tabBar:          { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  tabBtn:          { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3, position: 'relative' },
  tabIcon:         { fontSize: 14, color: 'rgba(255,255,255,0.3)' },
  tabIconActive:   { color: '#FFD700' },
  tabLabel:        { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5, textTransform: 'uppercase' },
  tabLabelActive:  { color: '#FFD700' },
  tabIndicator:    { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, backgroundColor: '#FFD700', borderRadius: 1 },
  panelArea:       { height: 190 },

  useBar:          { paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'android' ? 16 : 8 },
  useBtn:          { backgroundColor: '#FFF', borderRadius: 30, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  useBtnDisabled:  { opacity: 0.6 },
  useBtnTxt:       { fontSize: 16, fontWeight: '700', color: '#000', letterSpacing: 0.2 },
});

const fp = StyleSheet.create({
  container:         { gap: 10, paddingTop: 4 },
  catRow:            { paddingHorizontal: 16, gap: 8, flexDirection: 'row', alignItems: 'center' },
  catTab:            { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)' },
  catTabActive:      { backgroundColor: 'rgba(255,255,255,0.22)' },
  catLabel:          { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.45)' },
  catLabelActive:    { color: '#FFF', fontWeight: '600' },
  thumbRow:          { paddingHorizontal: 16, gap: 10, flexDirection: 'row', paddingBottom: 4 },
  thumbItem:         { alignItems: 'center', gap: 5 },
  thumbWrap:         { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 10, overflow: 'hidden', borderWidth: 2.5, borderColor: 'transparent', position: 'relative' },
  thumbWrapSelected: { borderColor: '#FFD700' },
  swatch:            { width: THUMB_SIZE, height: THUMB_SIZE },
  thumbEmoji:        { position: 'absolute', bottom: 2, right: 3, fontSize: 12 },
  thumbName:         { fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', width: THUMB_SIZE },
  thumbNameSel:      { color: '#FFF', fontWeight: '700' },
});

const cs = StyleSheet.create({
  wrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.4 },
  icon:  { fontSize: 32 },
  label: { fontSize: 16, color: '#FFF', fontWeight: '700' },
  sub:   { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
});