"""Focused new-pipeline tests; never change old-asset quality thresholds."""
import unittest
from PIL import Image
from pack import delivery_image, trim_image, layout


class TrimPackingTests(unittest.TestCase):
    def test_original_alpha_includes_faint_edges_and_reconstructs_exactly(self):
        source = Image.new('RGBA', (128, 128))
        source.putpixel((7, 9), (10, 20, 30, 1))
        source.putpixel((70, 110), (90, 80, 70, 255))
        bounds, crop = trim_image(source)
        self.assertEqual(bounds, (7, 9, 71, 111))
        restored = Image.new('RGBA', source.size)
        restored.paste(crop, bounds[:2])
        self.assertEqual(restored.tobytes(), source.tobytes())

    def test_empty_frames_are_rejected(self):
        with self.assertRaises(AssertionError):
            trim_image(Image.new('RGBA', (128, 128)))

    def test_full_offline_source_is_retained_and_delivery_is_128(self):
        source = Image.new('RGBA', (256, 256), (10, 20, 30, 255))
        before = source.tobytes()
        result = delivery_image(source, 128)
        self.assertEqual(result.size, (128, 128))
        self.assertEqual(source.tobytes(), before)
        self.assertEqual(source.size, (256, 256))

    def test_clip_rollback_never_splits_or_drops_frames(self):
        records = [{'name': f'{clip}_{i}', 'animation': clip} for clip in ['idle_E', 'run_E', 'death_E'] for i in range(3)]
        sizes = {r['name']: (20, 20) for r in records}
        pages = layout(records, sizes, limit=52, width=52)
        names = [name for placed, dim in pages for name in placed]
        self.assertEqual(len(names), 9)
        self.assertEqual(set(names), set(sizes))
        for clip in ['idle_E', 'run_E', 'death_E']:
            self.assertEqual(sum(any(n.startswith(clip) for n in placed) for placed, dim in pages), 1)
        for placed, (w,h) in pages:
            self.assertLessEqual(max(w,h),52)
            boxes = [(x-2,y-2,x+sizes[n][0]+2,y+sizes[n][1]+2) for n,(x,y) in placed.items()]
            for i,(a,b,c,d) in enumerate(boxes):
                for e,f,g,h in boxes[i+1:]:
                    self.assertFalse(a<g and e<c and b<h and f<d)

    def test_oversized_directional_clip_is_rejected(self):
        records = [{'name': str(i), 'animation': 'idle_E'} for i in range(5)]
        with self.assertRaises(AssertionError):
            layout(records, {r['name']:(20,20) for r in records}, limit=52, width=52)


if __name__ == '__main__':
    unittest.main()
