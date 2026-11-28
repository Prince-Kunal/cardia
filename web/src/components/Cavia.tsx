// A guinea pig (Cavia porcellus, the study's species), side on, facing right. Hidden until someone types
// "pig" (lib/eggs.ts); then it trots along the header's trace (looks/eggs.css). Decorative only.

export function Cavia() {
  return (
    <span className="cavia" aria-hidden="true">
      <svg viewBox="0 0 34 20">
        {/* feet */}
        <rect className="cavia-dark" x="8" y="17.2" width="3" height="2.2" rx="1" />
        <rect className="cavia-dark" x="21" y="17.2" width="3" height="2.2" rx="1" />
        {/* body: a loaf */}
        <path
          className="cavia-fur"
          d="M3 14.2C2.4 9.6 6.6 5.4 13 4.9c5.2-.4 9.8.2 13.2 2 3.4 1.8 5.7 4.3 5.9 6.9.2 2.6-1.9 4.3-5 4.4L7.6 18.4C5 18.4 3.3 16.7 3 14.2Z"
        />
        {/* the white blaze across the middle */}
        <path className="cavia-patch" d="M13.2 5c1.9 2.8 2.4 7.6 1.2 13.1l4.4-.1c1-5.3.2-10.4-1.6-13.1-1.3-.1-2.6-.1-4 .1Z" />
        {/* ear, eye, nose */}
        <path className="cavia-dark" d="M24.1 5.2c.9-1.6 2.9-2 3.6-.7.4.8-.2 1.9-1.4 2.3l-2.2-1.6Z" opacity="0.75" />
        <circle className="cavia-dark" cx="27.9" cy="9.4" r="1" />
        <circle className="cavia-dark" cx="32.2" cy="12.4" r="0.7" />
      </svg>
    </span>
  );
}
