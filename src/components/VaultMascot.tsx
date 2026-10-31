import React from 'react';

export type MascotPose =
  | 'waving'
  | 'pointing'
  | 'celebrating'
  | 'sleeping'
  | 'worried'
  | 'sad'
  | 'searching'
  | 'not-found';

export const MASCOT_IMAGE_PROMPTS: Record<
  MascotPose | 'pixel_key_3d',
  { titleEn: string; titleMl: string; prompt: string }
> = {
  waving: {
    titleEn: '1. Waving (Marketing Hero)',
    titleMl: '1. കൈവീശുന്ന പോസ് (ഹീറോ സ്ക്രീൻ)',
    prompt:
      'Cute 3D clay-style rounded capsule mascot character split into vibrant coral red (#FF4B55) top cap, sunny yellow (#EFC94C) left body, and royal blue (#1E4FD8) right body, wearing a lanyard ID badge with a traditional Kerala Kasavu cream-and-gold border, holding a chunky golden key in one gloved hand and happily waving with the other, white sneakers, soft studio 3D lighting, isolated on coral background.',
  },
  pointing: {
    titleEn: '2. Pointing at Alerts (Dashboard Banner)',
    titleMl: '2. അലേർട്ട് ചൂണ്ടിക്കാണിക്കുന്ന പോസ് (ഡാഷ്‌ബോർഡ്)',
    prompt:
      'Friendly 3D rounded capsule mascot in coral (#FF4B55), yellow (#EFC94C), and blue (#1E4FD8) with a Kerala Kasavu lanyard badge and golden vault key, pointing attentively toward the left to highlight upcoming document expiry alerts, helpful expression, soft studio shadows, clean gray target rings background.',
  },
  celebrating: {
    titleEn: '3. Celebrating (Document Renewed)',
    titleMl: '3. സന്തോഷിക്കുന്ന പോസ് (രേഖ പുതുക്കിയപ്പോൾ)',
    prompt:
      'Joyful 3D rounded capsule mascot in coral (#FF4B55), yellow (#EFC94C), and blue (#1E4FD8) wearing a Kerala Kasavu lanyard badge, jumping in celebration holding a glowing golden key aloft with confetti stars around, celebrating a renewed household document, Pixar-grade toy shader.',
  },
  sleeping: {
    titleEn: '4. Sleeping Calmly (Empty State)',
    titleMl: '4. ശാന്തമായി ഉറങ്ങുന്ന പോസ് (ഒഴിഞ്ഞ അവസ്ഥ)',
    prompt:
      'Peaceful 3D rounded capsule mascot in coral (#FF4B55), yellow (#EFC94C), and blue (#1E4FD8) wearing a Kerala Kasavu lanyard badge, resting with closed happy eyes hugging a golden vault key, floating Zzz bubbles, soft neutral gray studio card surface.',
  },
  worried: {
    titleEn: '5. Worried but Calm (Expired Item)',
    titleMl: '5. ശ്രദ്ധയോടെ ഓർമ്മിപ്പിക്കുന്ന പോസ് (കാലാവധി കഴിഞ്ഞവ)',
    prompt:
      'Attentive, slightly concerned but reassuring 3D rounded capsule mascot in coral (#FF4B55), yellow (#EFC94C), and blue (#1E4FD8) with a Kerala Kasavu lanyard badge, holding a small clock and golden key to gently remind the family about an expired document, soft warm 3D lighting.',
  },
  sad: {
    titleEn: '6. Sad / Concerned Avatar (Document Expired)',
    titleMl: '6. വിഷമത്തോടെ നോക്കുന്ന പോസ് (കാലാവധി കഴിഞ്ഞ രേഖ)',
    prompt:
      'Cute 3D Pixar/clay style rounded capsule mascot looking down sadly at an expired document sheet, worried puppy eyes and curved sad mouth, hand touching cheek, coral helmet with antenna, isolated transparent background.',
  },
  searching: {
    titleEn: '7. Searching Mascot (No Data Found)',
    titleMl: '7. തിരയുന്ന പോസ് (വിവരങ്ങൾ കണ്ടെത്തിയില്ല)',
    prompt:
      'Cute 3D capsule robot mascot leaning on clipboard holding magnifying glass looking for documents on transparent background.',
  },
  'not-found': {
    titleEn: '8. Document Not Found Mascot',
    titleMl: '8. രേഖകൾ കണ്ടെത്തിയില്ല',
    prompt:
      'Cute 3D capsule robot mascot leaning on clipboard holding magnifying glass looking for documents on transparent background.',
  },
  pixel_key_3d: {
    titleEn: '6. Voxel 3D Golden Key & Lock (Hero Right Accent)',
    titleMl: '6. 3D പിക്സൽ ഗോൾഡൻ താക്കോലും പൂട്ടും',
    prompt:
      'Isometric 3D voxel pixel-art golden key and ornate Kerala brass vault lock floating at a playful angle, warm amber and yellow (#EFC94C) cubes with crisp shadows and pink/coral #1 emblem detail, isolated on coral red background.',
  },
};

interface VaultMascotProps {
  pose?: MascotPose;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animated?: boolean;
}

export const VaultMascot: React.FC<VaultMascotProps> = ({
  pose = 'waving',
  size = 'lg',
  className = '',
  animated = true,
}) => {
  const dimensions =
    size === 'sm'
      ? 'w-20 h-20'
      : size === 'md'
      ? 'w-28 h-28'
      : size === 'lg'
      ? 'w-40 h-40'
      : 'w-52 h-52';

  const uid = `mascot-${pose}-${size}`;

  const isSad = pose === 'worried' || pose === 'sad';
  const isNotFound =
    pose === 'searching' || pose === 'not-found' || pose === 'sleeping';
  const imgSrc = isSad
    ? '/assets/avatar-mascot-sad.png'
    : isNotFound
    ? '/assets/avatar-mascot-not-found.png'
    : '/assets/avatar-mascot-hd.png';

  return (
    <div
      className={`inline-flex items-center justify-center select-none ${dimensions} ${
        animated ? 'mascot-bounce' : ''
      } ${className}`}
      role="img"
      aria-label={`Kudumba Vault 3D mascot (${pose} pose)`}
    >
      <img
        src={imgSrc}
        alt={`Kudumba Vault Mascot (${pose})`}
        className="w-full h-full object-contain filter drop-shadow-sm"
      />
    </div>
  );
};

/**
 * Pixel-style 3D Golden Key & Lock Object (replaces the Festie pixel trophy on the right of the Hero)
 */
export const PixelKey3D: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      className={`inline-flex items-center justify-center select-none mascot-bounce ${className}`}
      role="img"
      aria-label="3D pixel-style golden vault lock and key"
    >
      <svg viewBox="0 0 220 220" className="w-40 h-40 sm:w-48 sm:h-48 overflow-visible" fill="none">
        {/* Drop shadow */}
        <ellipse cx="112" cy="202" rx="52" ry="10" fill="rgba(11,11,12,0.22)" />

        {/* Pixelated 3D Shackle (Top Arch of Padlock) */}
        <g transform="rotate(8 110 110)">
          {/* Shackle 3D Depth Layer */}
          <rect x="76" y="28" width="68" height="16" fill="#C47D16" />
          <rect x="64" y="44" width="18" height="44" fill="#C47D16" />
          <rect x="138" y="44" width="18" height="44" fill="#C47D16" />

          {/* Shackle Front Pixel Blocks */}
          <rect x="72" y="24" width="68" height="16" fill="#EFC94C" stroke="#B56E0E" strokeWidth="2" />
          <rect x="60" y="40" width="18" height="44" fill="#EFC94C" stroke="#B56E0E" strokeWidth="2" />
          <rect x="134" y="40" width="18" height="44" fill="#EFC94C" stroke="#B56E0E" strokeWidth="2" />

          {/* Main Voxel Lock Body (3D Extruded Depth) */}
          <rect x="48" y="86" width="128" height="92" fill="#B56E0E" />
          <rect x="56" y="178" width="112" height="14" fill="#8F5106" />

          {/* Main Voxel Lock Body (Front Golden Grid) */}
          <rect x="42" y="80" width="128" height="92" fill="#F59E0B" stroke="#B56E0E" strokeWidth="2.5" />
          <rect x="50" y="88" width="112" height="76" fill="#EFC94C" />

          {/* Voxel Grid Lines for Authentic Pixel-3D Look */}
          <line x1="78" y1="80" x2="78" y2="172" stroke="#EFC94C" strokeWidth="2" strokeOpacity="0.45" />
          <line x1="106" y1="80" x2="106" y2="172" stroke="#EFC94C" strokeWidth="2" strokeOpacity="0.45" />
          <line x1="134" y1="80" x2="134" y2="172" stroke="#EFC94C" strokeWidth="2" strokeOpacity="0.45" />
          <line x1="42" y1="108" x2="170" y2="108" stroke="#EFC94C" strokeWidth="2" strokeOpacity="0.45" />
          <line x1="42" y1="136" x2="170" y2="136" stroke="#EFC94C" strokeWidth="2" strokeOpacity="0.45" />

          {/* Center Pixel Keyhole Emblem (Pink/Coral accent like the #1 on the reference trophy) */}
          <rect x="94" y="106" width="24" height="22" fill="#FF4B55" stroke="#0B0B0C" strokeWidth="2.5" />
          <rect x="100" y="128" width="12" height="20" fill="#0B0B0C" />
        </g>
      </svg>
    </div>
  );
};
