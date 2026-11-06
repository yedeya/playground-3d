// The one route: the page's markup, which the client component fills in once it runs in the browser. The update
// notice renders nothing until a new version of the offline app waits ([PWA-5]).
import SpeeltoestelApp from './speeltoestel-app';
import UpdateNotice from './update-notice';

export default function Page() {
  return (
    <>
      <div id="stage">
        <canvas id="view" aria-label="3D-model van het speeltoestel. Tik op een onderdeel om de gegevens te zien, of kies het hieronder uit de lijst."></canvas>
        <div id="title"><h1>Wickey ArcticFlyer</h1><p id="stats"></p></div>
        <div id="tools">
          <button className="tool" id="reset" type="button">Beginstand</button>
          <button className="tool" id="colour" type="button">Houtkleur</button>
        </div>
        <div id="hint">Eén vinger draait, twee zoomen en schuiven. Raster 1 m.</div>
        <div id="fail" hidden>Het 3D-beeld kan hier niet laden. Laad de pagina opnieuw of probeer een andere browser. De onderdelenlijst hieronder werkt wel.</div>
        <UpdateNotice />
      </div>
      <section id="panel" aria-label="Onderdelen">
        <div id="card" aria-live="polite"></div>
        <div className="row" id="modules" role="group" aria-label="Filter op module"></div>
        <div className="row" id="parts" role="group" aria-label="Onderdelen in deze selectie"></div>
      </section>
      <SpeeltoestelApp />
    </>
  );
}
