import { ImageResponse } from "next/og";

const SIZES = [32, 192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((s) => ({ id: String(s), size: { width: s, height: s }, contentType: "image/png" }));
}

/** Placeholder mark: a plum tile with a blush map pin. Replace when there's a logo. */
export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);
  return new ImageResponse(<Mark size={size} />, { width: size, height: size });
}

export function Mark({ size, padded = false }: { size: number; padded?: boolean }) {
  const pin = Math.round(size * (padded ? 0.46 : 0.58));
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#7a2e5c",
        borderRadius: padded ? 0 : Math.round(size * 0.22),
      }}
    >
      <svg width={pin} height={pin} viewBox="0 0 24 24">
        <path
          fill="#f3dde1"
          fillRule="evenodd"
          d="M12 2a8 8 0 0 0-8 8c0 5.6 6.6 11.3 7.3 11.8a1.1 1.1 0 0 0 1.4 0C13.4 21.3 20 15.6 20 10a8 8 0 0 0-8-8Zm0 4.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Z"
        />
      </svg>
    </div>
  );
}
