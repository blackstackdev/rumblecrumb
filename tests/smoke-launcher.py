from pathlib import Path
from urllib.request import urlopen
import subprocess,sys,time,re,json
from urllib.parse import urljoin

root=Path(__file__).resolve().parents[1]
process=subprocess.Popen([sys.executable,str(root/'serve.py'),'--no-open','--port','4330'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    for _ in range(40):
        try:
            with urlopen('http://127.0.0.1:4330/',timeout=1) as r:html=r.read().decode('utf-8')
            break
        except OSError:
            if process.poll() is not None:raise RuntimeError(process.stderr.read().decode())
            time.sleep(.05)
    else:raise RuntimeError('Local preview did not start')
    assert '<title>Rumblecrumb' in html
    assert 'v'+(root/'VERSION').read_text(encoding='utf-8').strip() in html
    files=re.findall(r'(?:src|href)="((?:\./|/)?assets/[^"]+)"',html)
    assert len(files)>=2
    results=[]
    for file in files:
        with urlopen(urljoin('http://127.0.0.1:4330/',file),timeout=3) as r:
            data=r.read();assert data;results.append({'file':file,'status':r.status,'bytes':len(data)})
    receipt={'passed':True,'loopbackOnly':True,'browserOpened':False,'distHtmlServed':True,'assets':results}
    (root/'.evidence').mkdir(exist_ok=True)
    (root/'.evidence'/'launcher-smoke.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    print(json.dumps(receipt))
finally:
    process.terminate()
    process.wait(timeout=5)
