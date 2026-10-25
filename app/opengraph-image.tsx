import { ImageResponse } from "next/og";

export const alt = "Parallax — We measure cost per returning customer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* Latin-only by design: the wordmark, the category and the positioning line
   are the English register of the brand. Keeping Thai out avoids shipping a
   font binary into the OG renderer. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 76,
          background: "#ffffff",
          position: "relative",
        }}
      >
        {/* the aurora field, flattened. Satori lays these out from explicit
            box metrics — `inset: 0` alone renders nothing. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            backgroundImage:
              "radial-gradient(circle 620px at 88% 110%, #ff3d8b 0%, rgba(106,92,255,0.55) 36%, rgba(255,255,255,0) 72%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            backgroundImage:
              "radial-gradient(circle 520px at 40% 118%, #ff4a1c 0%, rgba(224,53,154,0.55) 38%, rgba(255,255,255,0) 74%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            backgroundImage:
              "linear-gradient(102deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.84) 28%, rgba(255,255,255,0.22) 54%, rgba(255,255,255,0) 74%)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="44" height="44" viewBox="0 0 24 24">
            <path fill="#0b0b0d" fillRule="evenodd" d="M1.5 20 L8.5 6 L15.5 20 Z M8.5 20 L15.5 6 L22.5 20 Z" />
          </svg>
          <div
            style={{
              fontSize: 34,
              letterSpacing: -0.6,
              color: "#0b0b0d",
              fontWeight: 600,
            }}
          >
            Parallax
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 56,
              lineHeight: 1.2,
              letterSpacing: -1.8,
              maxWidth: 1000,
            }}
          >
            <div style={{ color: "#0b0b0d" }}>
              Everyone measures cost per lead.
            </div>
            <div style={{ color: "#56565e" }}>
              We measure cost per repeat customer.
            </div>
          </div>
          <div
            style={{
              fontSize: 23,
              letterSpacing: 5,
              textTransform: "uppercase",
              color: "#2e2e33",
            }}
          >
            We measure cost per returning customer
          </div>
        </div>
      </div>
    ),
    size,
  );
}
