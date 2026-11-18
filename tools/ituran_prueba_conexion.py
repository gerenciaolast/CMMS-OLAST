#!/usr/bin/env python3
"""Prueba de conexión al servicio web de GPS Ituran (WorldFleetLog).

Uso (las credenciales SOLO por variables de entorno, nunca en el código):
    ITURAN_USER=... ITURAN_PASSWORD=... ITURAN_COMPANY=... \
        python3 tools/ituran_prueba_conexion.py <carpeta_salida_fuera_del_repo>

1. Llama a Authenticate y muestra el resultado (true/false).
2. Llama a GetCarsInfoNew (estado actual de todos los vehículos) y guarda la
   respuesta XML en la carpeta de salida (contiene ubicaciones: no la suba al repo).
"""
URL="https://www.worldfleetlog.com/WebFleetStationServices/Online.asmx"
U,P,C=os.environ["ITURAN_USER"],os.environ["ITURAN_PASSWORD"],os.environ["ITURAN_COMPANY"]
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
e=lambda s: html.escape(s,quote=False)
HDR=f'<soap:Header><LoginInfo xmlns="http://tempuri.org/"><Username>{e(U)}</Username><Password>{e(P)}</Password><Company>{e(C)}</Company></LoginInfo></soap:Header>'
def call(action,body):
    env=f'<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">{HDR}<soap:Body>{body}</soap:Body></soap:Envelope>'
    req=urllib.request.Request(URL,env.encode(),{"Content-Type":"text/xml; charset=utf-8","SOAPAction":f'"http://tempuri.org/{action}"',"Accept-Encoding":"identity"})
    try: r=op.open(req,timeout=60); return r.status,r.read().decode('utf-8','replace')
    except urllib.error.HTTPError as x: return x.code,x.read().decode('utf-8','replace')
st,b=call("Authenticate",f'<Authenticate xmlns="http://tempuri.org/"><Username>{e(U)}</Username><Password>{e(P)}</Password><CompanyName>{e(C)}</CompanyName></Authenticate>')
print("Authenticate HTTP",st,re.findall(r"<AuthenticateResult>(.*?)</AuthenticateResult>",b) or b[:400])
st,b=call("GetCarsInfoNew",'<GetCarsInfoNew xmlns="http://tempuri.org/"><DeviceID></DeviceID></GetCarsInfoNew>')
print("GetCarsInfoNew HTTP",st,len(b),"bytes")
m=re.search(r"<GetCarsInfoNewResult>(.*?)</GetCarsInfoNewResult>",b,re.S)
if not m: print(b[:800]); sys.exit()
inner=html.unescape(m.group(1))
open(os.path.join(sys.argv[1],'ituran_estado_actual.xml'),'w').write(inner)
print("inner head:",inner[:300].replace(P,'***'))
