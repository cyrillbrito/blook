// The /viewer island: the shared viewer, with no host loader, so it opens on the drop zone.
import { ViewerApp } from '@blook/viewer';

export default function SiteViewer({ home }: { home: string }) {
  return (
    <ViewerApp
      note={
        <p className="text-xs text-muted">
          Opens a <code>blook-*.zip</code> exported from the Blook extension.{' '}
          <a href={home} className="text-fg underline">
            What is Blook?
          </a>
        </p>
      }
    />
  );
}
