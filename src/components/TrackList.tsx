import type { ReactNode } from 'react';

/**
 * Compact tracklist (design: "C · Tracklist gọn"): a header row
 * (# · Tiêu đề (duration on the thumbnail) · Kênh · Lượt xem · actions) followed by VideoRow rows.
 */
export default function TrackList({ label, children, showViews = true }: { label: string; children: ReactNode; showViews?: boolean }) {
  return (
    <div className="tracklist-wrap">
      <div role="table" aria-label={label} className={`tracklist${showViews ? '' : ' tracklist--no-views'}`}>
        <div role="row" className="tracklist__head">
          <span role="columnheader" className="tl-num">#</span>
          <span role="columnheader">Tiêu đề</span>
          <span role="columnheader" className="tl-channel">Kênh</span>
          <span role="columnheader" className="tl-views">Lượt xem</span>
          <span role="columnheader" className="tl-actions"><span className="sr-only">Thao tác</span></span>
        </div>
        <div className="tracklist__gap" aria-hidden="true" />
        <div role="rowgroup" className="tracklist__body">{children}</div>
      </div>
    </div>
  );
}
