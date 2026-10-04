import Head from 'next/head';
import { useController } from '../../components/dj-controller/useController';
import DesktopController from '../../components/dj-controller/DesktopController';
import ControllerOverlays from '../../components/dj-controller/ControllerOverlays';

function Controller() {
  const ctl = useController();
  return (
    <>
      <DesktopController ctl={ctl} />
      <ControllerOverlays ctl={ctl} />
    </>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────
export default function DJControllerPage() {
  return (
    <>
      <Head><title>DJ Controller</title></Head>
      <Controller />
    </>
  );
}
