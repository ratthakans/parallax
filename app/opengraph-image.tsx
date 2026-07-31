import { ImageResponse } from "next/og";

export const alt = "PARALLAX — We measure cost per returning customer";
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
              "radial-gradient(circle 620px at 88% -6%, #35c8ff 0%, rgba(77,155,255,0.55) 36%, rgba(255,255,255,0) 72%)",
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
              "radial-gradient(circle 520px at 96% 96%, #0047ff 0%, rgba(0,29,107,0.6) 38%, rgba(255,255,255,0) 74%)",
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
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 19.5 L12 4.5 L21 19.5"
              stroke="#0a1633"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <path
              d="M3 19.5 L21 19.5"
              stroke="#0a1633"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.4"
            />
            <circle cx="12" cy="4.5" r="2" fill="#0a1633" />
          </svg>
          <div
            style={{
              fontSize: 30,
              letterSpacing: 9,
              color: "#0a1633",
              fontWeight: 600,
            }}
          >
            PARALLAX
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
            <div style={{ color: "#0a1633" }}>
              Everyone measures cost per lead.
            </div>
            <div style={{ color: "#5b6b8c" }}>
              We measure cost per repeat customer.
            </div>
          </div>
          <div
            style={{
              fontSize: 23,
              letterSpacing: 5,
              textTransform: "uppercase",
              color: "#0047ff",
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
