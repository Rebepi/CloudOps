from pathlib import Path
from copy import deepcopy
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json, textwrap
from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT=Path(__file__).resolve().parent
SOURCE=Path('C:/Users/W11/Downloads/PIAD-626_FORMATOALUMNOTRABAJOFINAL.docx')
OUT=ROOT.parents[1]/'output'/'CloudOps_Formato_Alumno_Trabajo_Final.docx'
OUT.parent.mkdir(parents=True,exist_ok=True)
BLUE='1700F5'
TITLE='CloudOps para la planificación y evaluación de entornos AWS'
PEOPLE='Ramos Gonzales Diego / Renzo Bendezu Pinaud'

# Diagramas originales derivados de la arquitectura y del flujo implementados.
FONT='C:/Windows/Fonts/arial.ttf'; BOLD='C:/Windows/Fonts/arialbd.ttf'
def diagram(name, kind):
    im=Image.new('RGB',(1500,1400),'white'); dr=ImageDraw.Draw(im)
    def box(x,y,w,h,title,lines,fill='#EDF2FA'):
        dr.rounded_rectangle((x,y,x+w,y+h),radius=14,fill=fill,outline='#506783',width=2)
        f=ImageFont.truetype(BOLD,26); g=ImageFont.truetype(FONT,23)
        yy=y+18
        for line in textwrap.wrap(title,max(16,int(w/16))):
            dr.text((x+18,yy),line,font=f,fill='#102847'); yy+=33
        yy+=8
        for line in lines:
            for l in textwrap.wrap(line,max(16,int(w/13))):
                dr.text((x+18,yy),l,font=g,fill='#233348');yy+=31
    def arrow(points,label=None,at=None):
        dr.line(points,fill='#47658A',width=4)
        x,y=points[-1];px,py=points[-2]
        import math
        a=math.atan2(y-py,x-px)
        dr.polygon([(x,y),(x-17*math.cos(a-.45),y-17*math.sin(a-.45)),(x-17*math.cos(a+.45),y-17*math.sin(a+.45))],fill='#47658A')
        if label:dr.text(at,label,font=ImageFont.truetype(FONT,21),fill='#294A70')
    if kind=='architecture':
        box(455,20,590,125,'Usuario en navegador',['Acceso autenticado a CloudOps'])
        arrow([(750,145),(750,200)],'HTTP local / API',(785,158))
        box(350,200,800,150,'Interfaz React y TypeScript',['Dashboard · Infraestructura · Red · Seguridad','Costos · Servicios · Planificación · Proyectos'])
        arrow([(750,350),(750,410)],'Solicitudes autenticadas',(780,367))
        box(350,410,800,155,'Backend Fastify y TypeScript',['Autenticación · validación · consultas AWS','Evaluaciones · normalización · informes · IA'])
        arrow([(350,485),(245,485),(245,655)])
        arrow([(750,565),(750,655)])
        arrow([(1150,485),(1265,485),(1265,655)])
        box(25,655,440,235,'PostgreSQL 17 en Docker',['Usuarios y sesiones','Propuestas y costos planificados','Proyectos, resultados e historial','SBOM y planes de mejora'])
        box(520,655,460,235,'Motor de análisis',['ZIP o commit de GitHub','Reglas internas, Semgrep,','Gitleaks, Trivy y consulta OSV','Código recibido no se ejecuta'])
        box(1035,655,440,235,'AWS SDK y STS',['Rol temporal de auditoría','Inventario, red, IAM y registros','Cost Explorer y precios','Config, Security Hub, Inspector'])
        arrow([(750,890),(750,990)])
        arrow([(1265,890),(1265,940),(750,940)])
        box(350,990,800,175,'Asesor IA mediante Groq',['Contexto normalizado y referencias anónimas','Propuesta de acciones, alternativas y verificación','Revisión humana antes de incluirla en el informe'])
        dr.text((45,1230),'Entorno local: frontend y API como procesos Node; PostgreSQL y analizadores en Docker.',font=ImageFont.truetype(FONT,23),fill='#233348')
        dr.text((45,1270),'Servicios externos: AWS, GitHub, OSV y Groq. Las flechas representan intercambio de datos.',font=ImageFont.truetype(FONT,23),fill='#233348')
        dr.text((45,1310),'La planificación y las recomendaciones no despliegan ni modifican recursos AWS.',font=ImageFont.truetype(BOLD,23),fill='#233348')
    elif kind=='flow':
        box(480,15,540,100,'1  Ingresar a CloudOps',['Validar la sesión de usuario'])
        arrow([(750,115),(750,155)])
        box(380,155,740,110,'2  Elegir el objetivo de trabajo',['Consultar, planificar o evaluar un proyecto'])
        arrow([(380,210),(225,210),(225,320)])
        arrow([(750,265),(750,320)])
        arrow([(1120,210),(1270,210),(1270,320)])
        box(20,320,420,250,'Consultar entorno AWS',['Dashboard e infraestructura','Red y centro de seguridad','Gastos observados y catálogo','Mostrar fuente, fecha y límites'])
        box(530,320,440,250,'Planificar una solución',['Definir demanda y presupuesto','Seleccionar servicios y región','Estimar costos y comparar','Guardar propuesta local'])
        box(1060,320,420,250,'Evaluar un proyecto',['Registrar ZIP o GitHub','Elegir código, AWS o integral','Recopilar evidencia disponible','Guardar evaluación e historial'])
        arrow([(1270,570),(1270,635),(750,635),(750,690)])
        box(380,690,740,150,'3  Comprender la evaluación',['Diagnóstico y cobertura del alcance','Riesgos con evidencia · estructura y dependencias'])
        arrow([(750,840),(750,900)])
        box(380,900,740,150,'4  Preparar la mejora',['Revisar prioridades y recomendaciones de IA','Asignar seguimiento y revisar el plan propuesto'])
        arrow([(750,1050),(750,1115)])
        box(380,1115,740,130,'5  Corregir y comprobar',['Corrección fuera de CloudOps; nueva evaluación','Comparar solo resultados de metodología compatible'])
        arrow([(225,570),(225,1310),(750,1310)])
        arrow([(970,445),(1060,445)])
        arrow([(750,1245),(750,1310)])
        dr.text((770,1290),'Informes y decisiones con evidencia',font=ImageFont.truetype(BOLD,24),fill='#233348')
        dr.text((770,1330),'No hay despliegue automático.',font=ImageFont.truetype(FONT,23),fill='#233348')
    else:
        box(30,40,400,150,'Usuarios',['Identidad, rol y acceso','1 usuario → varias sesiones'])
        box(30,275,400,130,'Sesiones',['Validación del acceso','a las funciones del sistema'])
        arrow([(230,190),(230,275)],'1 a N',(250,220))
        box(560,40,440,150,'Proyectos',['Nombre, origen y entorno','Región y datos del proyecto'])
        box(1080,40,390,150,'Propuestas y costos',['Vínculo opcional al proyecto','Estimaciones guardadas'])
        arrow([(1000,110),(1080,110)],'1 a N',(1008,70))
        box(560,320,440,170,'Evaluaciones de seguridad',['Tipo, estado y metodología','Índice, cobertura y resumen','1 proyecto → varias ejecuciones'])
        arrow([(780,190),(780,320)],'1 a N',(800,240))
        box(45,650,420,165,'Hallazgos',['Severidad, recurso y evidencia','Recomendación y seguimiento'])
        box(540,650,430,165,'Analizadores e inventario',['Estado y cobertura del análisis','SBOM de la evaluación'])
        box(1045,650,425,165,'Asesoría de IA',['Borrador, modelo y referencias','Revisión y vigencia del plan'])
        arrow([(560,450),(490,450),(490,585),(250,585),(250,650)],'1 a N',(280,600))
        arrow([(780,490),(780,650)],'1 a N / SBOM',(800,560))
        arrow([(1000,405),(1250,405),(1250,650)],'Por evaluación',(1260,545))
        box(45,1000,420,150,'Eventos de hallazgos',['Cambio de estado, responsable','y registro de auditoría'])
        arrow([(250,815),(250,1000)],'1 a N',(270,895))
        box(540,1000,930,150,'Configuración y caché de consultas AWS',['Tablas auxiliares para preferencias y respuestas temporales.','El diagrama resume entidades; omite atributos y tablas operativas.'])
        dr.text((45,1250),'Relaciones verificadas en las migraciones del proyecto. No representa aislamiento por organización.',font=ImageFont.truetype(FONT,24),fill='#233348')
    p=ROOT/f'{name}.png';im.save(p);return p

architecture=diagram('arquitectura','architecture')
flow=diagram('flujo','flow')
data=diagram('datos','data')

d=Document(SOURCE); original=list(d.element.body); tables=[deepcopy(t._tbl) for t in d.tables]
sourcehash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
contract=f'''# Contrato del formato alumno
Referencia: {SOURCE}\nSHA256: {sourcehash}
Referencia renderizada con Word oculto: reference/reference.pdf; 10 páginas inspeccionadas.
El renderizador de la skill se ejecutó y falló por ausencia de LibreOffice empaquetado para Windows.
Alternativa: Word COM oculto para PDF; Python empaquetado y PDFium para PNG. Sin interacción con pantalla.
Tres secciones A4: márgenes cm 2/1.5/2/1.5; 2.5/0.44/2.5/1.75; 2.5/0.44/2.5/3.
Preservar íntegramente portada y contraportada, imágenes, encabezados, pies con PAGE, estilos, temas y numeración.
Editar solo cuerpo entre datos del alumno y valoración. Formularios Arial, líneas negras, encabezados azules y relleno azul claro.
Reutilizar tablas de datos, preguntas, cronograma, recursos, propuesta, ejecución, diagramas, control y valoración.
Ampliar páginas en el cuerpo para respuestas, diagramas y espacios de captura. Sustituir las cajas vacías flotantes por texto en flujo; mantener las seis etapas y preguntas originales.
Reproducir bandas de sección en el flujo para impedir superposición al ampliar contenido; misma identidad azul institucional.
Campos: integrantes/IDs y datos académicos confirmados. Preguntas guía propuestas identificadas; cronograma relativo propuesto, sin fechas inventadas. Autoevaluación orientativa sujeta a validación.
Solo document.xml, document.xml.rels y Content_Types son editables; nuevas imágenes permitidas. Partes restantes se copian byte a byte del original.
'''
(ROOT/'artifact.md').write_text(contract,encoding='utf-8')
with ZipFile(SOURCE) as z:
 (ROOT/'package-inventory.json').write_text(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()},indent=2),encoding='utf-8')

# Mantener portada completa y las tres secciones originales; se amplía el cuerpo editable.
for e in original[37:104]:d.element.body.remove(e)
tail=original[104:]
for e in tail:d.element.body.remove(e)

def xml(tag,**attrs):
 e=OxmlElement(tag)
 for k,v in attrs.items():e.set(qn('w:'+k),str(v))
 return e

def fmt(p,size=11,bold=False,align=None,after=6):
 p.paragraph_format.space_before=Pt(0);p.paragraph_format.space_after=Pt(after)
 p.paragraph_format.line_spacing=1.1
 p.paragraph_format.widow_control=True
 if align is not None:p.alignment=align
 for r in p.runs:
  r.font.name='Arial';r.font.size=Pt(size)
  if bold is not None:r.font.bold=bold
  r.font.color.rgb=RGBColor.from_string('000000')
 return p
def para(text='',bold=False,size=11,after=6):
 p=fmt(d.add_paragraph(text),size,bold,after=after)
 prev=p._p.getprevious()
 if prev is not None and prev.tag==qn('w:tbl'):p.paragraph_format.space_before=Pt(6)
 return p
def h(text):
 p=para(text,True,12,9);p.paragraph_format.keep_with_next=True;return p
def page(title,chapter=False):
 p=para(title,True,15 if chapter else 13,12)
 p.paragraph_format.page_break_before=True
 p.paragraph_format.keep_with_next=True
 if chapter:
  p._p.get_or_add_pPr().append(xml('w:shd',fill=BLUE))
  p.paragraph_format.space_before=Pt(7);p.paragraph_format.space_after=Pt(15)
  for r in p.runs:r.font.color.rgb=RGBColor(255,255,255)
 return p
def setcell(c,text,size=10,bold=False):
 c.text=text
 for p in c.paragraphs:fmt(p,size,bold,after=4)
 c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
def clean_table(t,widths=None,size=10):
 t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.autofit=False
 pr=t._tbl.tblPr
 for tag in ['tblpPr','tblInd']:
  for e in list(pr.findall(qn('w:'+tag))):pr.remove(e)
 if widths:
  for i,w in enumerate(widths):
   t.columns[i].width=Cm(w)
   for row in t.rows:
    if len(row.cells)==len(widths):row.cells[i].width=Cm(w)
 for row in t.rows:
  for e in list(row._tr.findall('.//'+qn('w:trHeight'))):e.getparent().remove(e)
  trpr=row._tr.get_or_add_trPr();trpr.append(xml('w:cantSplit'))
  seen=set()
  for c in row.cells:
   if id(c._tc) in seen:continue
   seen.add(id(c._tc))
   tcpr=c._tc.get_or_add_tcPr();m=xml('w:tcMar')
   for side in ['top','left','bottom','right']:m.append(xml('w:'+side,w=70,type='dxa'))
   tcpr.append(m)
   for p in c.paragraphs:fmt(p,size,bold=None,after=4)
 return t
def clone_table(index):
 from docx.table import Table
 el=deepcopy(tables[index]);d.element.body.append(el);return clean_table(Table(el,d))
def table(headers,rows,widths,size=10):
 t=d.add_table(rows=1,cols=len(headers));clean_table(t,widths,size)
 borders=xml('w:tblBorders')
 for s in ['top','left','bottom','right','insideH','insideV']:borders.append(xml('w:'+s,val='single',sz=4,color='999999'))
 t._tbl.tblPr.append(borders)
 for i,x in enumerate(headers):
  setcell(t.rows[0].cells[i],x,size,True);t.rows[0].cells[i]._tc.get_or_add_tcPr().append(xml('w:shd',fill='CCDDF0'))
 t.rows[0]._tr.get_or_add_trPr().append(xml('w:tblHeader'))
 for vals in rows:
  row=t.add_row()
  for i,x in enumerate(vals):setcell(row.cells[i],x,size)
 clean_table(t,widths,size)
 return t
def picture(path,width=15.5):
 p=d.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
 r=p.add_run();r.add_picture(str(path),width=Cm(width))
 p.paragraph_format.space_after=Pt(8)
 for dp in p._p.xpath('.//wp:docPr'):dp.set('descr',path.stem+' del sistema CloudOps')

# 2 Datos e información.
para('DATOS DEL ESTUDIANTE',True,13,12)
t=clone_table(0)
setcell(t.cell(0,1),'Ramos Gonzales Diego\nRenzo Bendezu Pinaud',10)
setcell(t.cell(0,3),'001572484\n001596480',10)
setcell(t.cell(1,1),'Lima - Callao / CFP Independencia')
setcell(t.cell(2,1),'Ingeniería de Software con Inteligencia Artificial',10)
setcell(t.cell(2,4),'VI',10)
setcell(t.cell(3,1),'TECNOLOGÍA CLOUD CON AWS')
setcell(t.cell(4,1),TITLE)
para('',after=8)
p=para('1. INFORMACIÓN',True,15,13);p._p.get_or_add_pPr().append(xml('w:shd',fill=BLUE));p.runs[0].font.color.rgb=RGBColor(255,255,255)
h('Identifica la problemática del caso práctico propuesto.')
para('La consulta de infraestructura, redes, permisos, costos y riesgos de software suele estar distribuida entre varias herramientas y pantallas. Para un equipo que debe diseñar o revisar una solución AWS, esta dispersión dificulta relacionar el presupuesto, los servicios elegidos, la estructura del proyecto y los problemas que requieren atención.')
para('El caso desarrollado consiste en organizar esa información en CloudOps. El problema no es únicamente detectar vulnerabilidades: también es reconocer qué recursos se observaron, cómo se conectan las decisiones de arquitectura con el costo y qué evidencia respalda una recomendación. Sin esa separación, una estimación puede confundirse con un gasto real o una cobertura alta con ausencia de riesgos.')
h('Identifica propuesta de solución y evidencias.')
para('Desarrollamos una aplicación web que reúne consulta de AWS, planificación de soluciones, estimación de costos y evaluación de proyectos ZIP o GitHub. Presenta resultados con su alcance y permite revisar hallazgos, explorar estructura y dependencias, preparar mejoras asistidas por IA y conservar el historial en PostgreSQL.')
para('Las evidencias del trabajo son el código del sistema, sus migraciones, las pruebas y líneas base registradas, los diagramas de esta propuesta y las capturas previstas en la sección de ejecución. El objetivo es apoyar decisiones técnicas y económicas con información trazable; el sistema no certifica seguridad ni aplica correcciones automáticamente.')

page('Respuestas a preguntas guía')
para('Preguntas orientadoras propuestas para este proyecto, sujetas a validación con el instructor.',size=10)
qas=[
('¿Qué necesidad resuelve CloudOps y quién utilizará la solución?','Permite a estudiantes, desarrolladores y responsables técnicos consultar un entorno AWS y planificar o evaluar una aplicación desde un mismo espacio. Organiza inventario, red, costos, propuestas y riesgos para reducir la revisión fragmentada. El beneficio esperado es comprender la situación y decidir qué revisar o mejorar; no se afirma una reducción de incidentes o costos sin medirla.'),
('¿Cómo se organiza el sistema y por qué se eligieron estas tecnologías?','React y TypeScript implementan la interfaz; Fastify y TypeScript ofrecen la API; PostgreSQL conserva los datos y Docker facilita la base de datos y los analizadores. La separación permite mantener las credenciales y consultas externas en el backend. El AWS SDK usa un rol temporal de auditoría. Esta arquitectura permite desarrollar y demostrar el proyecto localmente sin desplegar todos sus componentes en AWS.'),
('¿Cómo se integran planificación, infraestructura, servicios y costos?','La consulta del entorno muestra recursos regionales, redes e información de la cuenta. El catálogo ayuda a seleccionar servicios y consultar precios. Planificación Cloud registra requerimientos y propuestas; Costos y FinOps distingue cotizaciones de la información obtenida de Cost Explorer. Las propuestas pueden vincularse a proyectos. Los escenarios y simulaciones no aprovisionan recursos ni constituyen pruebas reales de recuperación.'),
('¿Cómo se evalúa la seguridad y se utiliza la inteligencia artificial?','Se selecciona código, cuenta AWS o un alcance integral. Se recopilan archivos y datos autorizados; los analizadores detectan secretos, problemas de código, dependencias e infraestructura declarada. Los resultados conservan severidad, evidencia y límites. El índice y la cobertura representan medidas distintas. Groq recibe contexto normalizado y referencias anónimas para proponer pasos de mejora; una persona revisa el borrador y una nueva evaluación comprueba las correcciones.'),
('¿Cómo se comprobará la calidad y la viabilidad del proyecto?','Se verifican autenticación, persistencia, consultas AWS, separación de estimaciones, evaluación de ZIP y GitHub, navegación, informes y revisión de IA. Se aprovechan las pruebas automatizadas y la línea base documentada, además de una demostración funcional de todos los módulos. Se consideran permisos, costos de proveedores, disponibilidad de Docker y límites de los analizadores. La puesta en producción requiere validaciones adicionales de autorización, operación y escalabilidad.')]
t=clone_table(1)
for i,(q,a) in enumerate(qas):
 setcell(t.rows[2*i].cells[0],f'Pregunta {i+1:02d}:',10,True);setcell(t.rows[2*i].cells[1],q,10,True)
 setcell(t.rows[2*i+1].cells[0],a,10)

page('2. PLANIFICACIÓN DEL TRABAJO',True)
h('Cronograma de actividades')
para('Plan de referencia de seis semanas para organizar la entrega. Las fechas y el cumplimiento se registrarán en la bitácora del equipo.',size=10)
t=clone_table(2)
for i in range(6):setcell(t.rows[1].cells[i+2],f'S{i+1}',9,True)
activities=[('1','Requerimientos y alcance',['X','','','','','']),('2','Arquitectura, datos y entorno',['X','X','','','','']),('3','AWS, inventario, red y seguridad',['','X','X','','','']),('4','Servicios, planificación y costos',['','','X','X','','']),('5','Evaluaciones, evidencias e IA',['','','','X','X','']),('6','Pruebas, capturas y sustentación',['','','','','X','X'])]
for ri,row in enumerate(activities,2):
 for ci,v in enumerate([row[0],row[1],*row[2]]):setcell(t.rows[ri].cells[ci],v,9)
para('Responsables propuestos: Diego y Renzo participan en el diseño, desarrollo, revisión cruzada y demostración. La distribución final se acuerda en el equipo.',size=10,after=10)
h('Lista de recursos necesarios')
resources=[
 (3,[('Equipos de desarrollo con virtualización','2 previstos'),('Acceso a red y router','1 conexión'),('Almacenamiento para código y respaldos','Según equipo'),('Monitor y periféricos de trabajo','Por integrante')]),
 (4,[('Node.js, npm, Git y editor de código','1 entorno/equipo'),('Docker Desktop, Compose y PostgreSQL','1 entorno local'),('AWS CLI y cuenta con rol de auditoría','1 cuenta autorizada'),('OSV, Semgrep, Gitleaks, Trivy y Groq','Según análisis')]),
 (5,[('Repositorio CloudOps y documentación','1 repositorio'),('ZIP y repositorio de prueba autorizados','1 caso mínimo'),('Acceso a internet y consumo de API/AWS','Según uso'),('Formato alumno y capturas de evidencia','1 entrega digital')])]
for idx,rows in resources:
 t=clone_table(idx)
 for ri,(a,b) in enumerate(rows,2):setcell(t.rows[ri].cells[0],a,9);setcell(t.rows[ri].cells[1],b,9)
 clean_table(t,[12,4.1],9)
 for row in t.rows:
  for c in row.cells:
   for p in c.paragraphs:
    p.paragraph_format.space_after=Pt(1);p.paragraph_format.line_spacing=1
   for margin in c._tc.xpath('.//w:tcMar/*'):margin.set(qn('w:w'),'35')
 if idx!=5:para('',after=2)

page('3. DECIDIR PROPUESTA',True)
h('Describe la propuesta determinada para la solución del caso práctico')
t=clone_table(6)
setcell(t.cell(1,0),'Proponemos CloudOps como un espacio de trabajo para comprender un entorno AWS, diseñar alternativas y evaluar proyectos con evidencia. Integra consulta operativa, estimación económica y análisis de software; conserva las evaluaciones para dar seguimiento y exportar resultados.\n\nObjetivo general: centralizar la información necesaria para planificar y revisar soluciones cloud, diferenciando datos observados, estimaciones y recomendaciones.\n\nObjetivos específicos: visualizar recursos y redes; registrar propuestas y costos; analizar código y configuración AWS; priorizar hallazgos; explicar cobertura y límites; y preparar un plan de mejora revisable.',10)
h('Alcance funcional de la solución')
modules=[
('Dashboard','Vista general de la cuenta, recursos, actividad y costos disponibles.','Orientar la revisión del entorno.'),
('Infraestructura','Regiones, zonas e inventario; simulación visual de failover.','Explorar distribución; la simulación no prueba continuidad.'),
('Red y VPC','VPC, subredes, rutas, gateways, Security Groups y Flow Logs disponibles.','Revisar conectividad y reglas de exposición.'),
('Centro de Seguridad','Identidades, permisos, registros y fuentes de postura; simulación IAM.','Examinar acceso y controles de cuenta.'),
('Servicios AWS','Catálogo de servicios y ofertas consultadas mediante AWS Pricing.','Comparar opciones tecnológicas.'),
('Planificación Cloud','Requerimientos, dimensionamiento, propuestas y exportaciones.','Evaluar alternativas antes de implementarlas.'),
('Costos y FinOps','Ítems de estimación, presupuesto y gastos consultados de AWS.','Diferenciar costo proyectado y gasto observado.'),
('Proyectos','ZIP/GitHub, evaluación de código/AWS/integral, evidencias e IA.','Diagnóstico, riesgos, estructura y plan de mejora.')]
table(['Módulo','Función principal','Utilidad'],modules,[3,7.6,5.5],9)
para('La viabilidad inicial se basa en un entorno local reproducible y en el uso de servicios existentes mediante permisos autorizados. Las consultas y proveedores pueden generar costos; las cifras deben revisarse para la región y fecha de cada decisión.',size=10)

ops=[
('1. Definir el alcance. Identificar usuarios, módulos y fuentes; distinguir consulta, planificación y evaluación.','Calidad: requerimientos verificables y criterios de aceptación.'),
('2. Preparar el entorno. Instalar dependencias, iniciar PostgreSQL con Compose, aplicar migraciones y levantar API e interfaz.','Reproducibilidad: versiones y archivos de bloqueo; respaldo previo de datos.'),
('3. Configurar autenticación. Validar inicio de sesión y acceso a las funciones protegidas.','Credenciales locales separadas de AWS; secretos fuera del repositorio.'),
('4. Configurar AWS. Utilizar una identidad autorizada y asumir el rol temporal de auditoría.','Mínimo privilegio; no usar root como identidad de auditoría.'),
('5. Integrar Dashboard. Consultar identidad, inventario, actividad y costo disponibles.','Identificar fuente, fecha y errores; no sustituir fallos por resultados ficticios.'),
('6. Construir Infraestructura. Consultar regiones, zonas e inventario del alcance elegido.','Diferenciar recursos observados y simulación visual de recuperación.'),
('7. Incorporar Red y VPC. Presentar subredes, rutas, gateways y reglas de seguridad.','Lectura autorizada y revisión de exposición; no modificar la red durante la demostración.'),
('8. Desarrollar Centro de Seguridad. Consultar identidades, controles y registros; probar simulación de políticas.','La simulación IAM no concede permisos ni acredita por sí sola acceso efectivo.'),
('9. Integrar catálogo y precios. Consultar servicios y ofertas por configuración/región.','Registrar contexto del precio; no presentarlo como factura contractual.'),
('10. Implementar Planificación y FinOps. Capturar requerimientos, estimar ítems, guardar propuestas y consultar gastos.','Separar cotización de Cost Explorer; controlar uso y presupuesto de servicios.') ,
('11. Registrar proyectos. Elegir ZIP o GitHub y guardar sus datos de origen.','Validar formato y tamaño; no ejecutar ni instalar el código recibido.'),
('12. Seleccionar evaluación. Elegir código, AWS o integral y mostrar el estado de ejecución.','Consentimiento de alcance y manejo de errores; no confundir carga con análisis terminado.'),
('13. Ejecutar analizadores. Revisar secretos, código, dependencias, imágenes e infraestructura declarada.','OSV, Semgrep, Gitleaks, Trivy y reglas internas; conservar estados parciales u omitidos.'),
('14. Normalizar evidencia. Relacionar hallazgos, fuente, severidad, componente y cobertura.','Deduplicación y trazabilidad; ausencia de evidencia no equivale a seguridad.'),
('15. Presentar resultados. Organizar Diagnóstico, Riesgos, Proyecto y Plan de mejora.','Accesibilidad, contraste, ayudas contextuales y navegación sin información duplicada.'),
('16. Explorar estructura. Mostrar árbol de archivos, tecnologías y dependencias vinculadas a evidencia.','Una tecnología detectada no demuestra un despliegue ni conexiones de red.'),
('17. Solicitar asesoría IA. Enviar contexto normalizado, validar referencias y mostrar propuestas de corrección.','Privacidad: sin código ni valores secretos; revisión humana y sin ejecución automática.'),
('18. Comprobar y exportar. Probar flujos, revisar el informe y comparar evaluaciones compatibles.','Una tarea marcada como atendida no demuestra remediación; se requiere nueva evaluación.'),
('19. Preparar evidencias. Insertar capturas, registrar condiciones de prueba y revisar el formato alumno.','Ocultar claves, tokens y datos sensibles; no alterar resultados para la presentación.'),
('20. Cerrar la práctica. Guardar código y respaldos; apagar servicios de laboratorio que no se utilicen.','SHI: postura, pausas, ventilación y cableado seguro. Ambiente: ahorro energético y entrega digital.')]
for part in range(2):
 page('4. EJECUTAR' if part==0 else 'Ejecución de la solución continuación',part==0)
 if part==0:
  para('Resolver el caso práctico y fundamentar las operaciones con los conocimientos del curso. Se consideran calidad, seguridad, higiene industrial y medio ambiente.',size=10)
  para('Aplicamos programación web, APIs, persistencia relacional, redes, identidad AWS y estimación cloud. La siguiente secuencia describe el procedimiento de implementación y demostración.',size=10)
 t=clone_table(7)
 for r in list(t._tbl.tr_lst)[11:]:t._tbl.remove(r)
 for i,(a,b) in enumerate(ops[part*10:part*10+10],1):setcell(t.rows[i].cells[0],a,10);setcell(t.rows[i].cells[1],b,9)
 clean_table(t,[10.6,5.5],10)
 para('Las pautas de calidad, seguridad y ambiente orientan la práctica. Este trabajo no declara una certificación normativa ni una auditoría de cumplimiento legal.',size=10)

for heading,path,desc in [
 ('Arquitectura general de CloudOps',architecture,'La interfaz consulta la API; esta mantiene la persistencia y controla el acceso a las fuentes externas. Los recursos AWS pertenecen a la cuenta auditada. La aplicación local y la infraestructura observada son ámbitos distintos.'),
 ('Flujo de uso de la solución',flow,'El usuario puede consultar el entorno, formular una propuesta o evaluar un proyecto. En seguridad, la evidencia conduce al diagnóstico y a la mejora; su efectividad se comprueba con una ejecución posterior compatible.'),
 ('Modelo de información resumido',data,'El esquema resume las principales entidades de las migraciones. Los resultados se conservan por evaluación para mantener trazabilidad. Propuestas e ítems de costo pueden estar vinculados a un proyecto; no se representa un modelo de aislamiento entre organizaciones.')]:
 page('DIBUJO / ESQUEMA / DIAGRAMA DE PROPUESTA')
 h(heading);picture(path,15.8);para(desc,size=10)
 table(['Tema','Integrantes','Escala'],[['CloudOps',PEOPLE,'Esquema sin escala']],[3,10.4,2.7],9)

captures=[
('Dashboard','Mostrar cuenta/región, indicadores y origen de los datos.','Infraestructura','Mostrar regiones o zonas y recursos observados; identificar las simulaciones.'),
('Red y VPC','Mostrar una VPC, subredes o rutas y sus reglas de Security Groups.','Centro de Seguridad','Mostrar identidades o un control consultado, su fuente y resultado.'),
('Costos y FinOps','Mostrar cotización y presupuesto; distinguirlos del gasto de Cost Explorer.','Servicios AWS','Mostrar catálogo y una oferta con región y configuración del precio.'),
('Planificación Cloud','Mostrar requerimientos y una propuesta guardada con su estimación.','Portafolio y nueva evaluación','Mostrar proyecto, origen ZIP/GitHub y opciones de alcance de análisis.'),
('Diagnóstico de un proyecto','Mostrar evaluación finalizada, índice, cobertura y principales áreas revisadas.','Riesgos y evidencia','Mostrar un hallazgo, severidad, archivo o recurso, evidencia y recomendación.'),
('Estructura y componentes','Mostrar árbol de archivos, tecnologías o dependencias de la evaluación.','Plan de mejora e informe','Mostrar una acción de IA con evidencia y revisión; adjuntar vista de exportación si corresponde.')]
for pi,pair in enumerate(captures):
 page('Evidencias visuales de la solución')
 para('Insertar capturas propias de la demostración. Conservar legibilidad y ocultar credenciales, tokens o información sensible.',size=10)
 for j in range(2):
  n=pi*2+j+1;name,desc=pair[j*2:j*2+2]
  h(f'Captura {n:02d}  {name}')
  para(desc,size=10)
  t=table(['ESPACIO PARA INSERTAR CAPTURA'],[['']],[16.1],10)
  t.rows[1].height=Cm(5.6)
  from docx.enum.table import WD_ROW_HEIGHT_RULE
  t.rows[1].height_rule=WD_ROW_HEIGHT_RULE.AT_LEAST
  para('Fecha: ____________________    Resultado observado: __________________________',size=9,after=12)

page('5. CONTROLAR',True)
para('Verificar el cumplimiento de los procesos desarrollados en la propuesta de solución del caso práctico.',bold=True,size=11)
para('Control de la entrega actual. Las marcas pendientes requieren validación del equipo antes de la sustentación; no se confunden con resultados de pruebas del software.',size=10)
# Se conserva el texto de todos los criterios. El original usa controles de casilla
# anidados; se recrean solo las celdas editables para que puedan marcarse en Word.
criteria=[
('¿Se identificó claramente la problemática del caso práctico?','X',''),
('¿Se desarrolló las condiciones de los requerimientos solicitados?','X',''),
('¿Se formularon respuestas claras y fundamentadas a todas las preguntas guía?','Validar',''),
('¿Se elaboró un cronograma claro de actividades a ejecutar?','X',''),
('¿Se identificaron y listaron los recursos necesarios para ejecutar la propuesta?','X',''),
('¿Se ejecutó la propuesta de acuerdo con la planificación y cronograma establecidos?','Validar',''),
('¿Se describieron todas las operaciones y pasos seguidos para garantizar la correcta ejecución?','X',''),
('¿Se consideran las normativas técnicas, de seguridad y medio ambiente en la propuesta de solución?','X',''),
('¿La propuesta es pertinente con los requerimientos solicitados?','X',''),
('¿Se evaluó la viabilidad de la propuesta para un contexto real?','X','')]
table(['EVIDENCIAS','CUMPLE','NO CUMPLE'],criteria,[12.1,2,2],10)
h('Comprobaciones pendientes de cierre')
para('Validar las preguntas orientadoras con el instructor; confirmar el cronograma realmente seguido; insertar las doce capturas; y registrar la fecha y el resultado de la demostración completa. Los espacios sin captura no se consideran evidencia entregada.',size=10)
h('Criterio de aceptación')
para('La entrega debe permitir recorrer los ocho módulos, identificar la fuente de cada resultado y guardar o exportar la información correspondiente. Un servicio no habilitado o sin permisos debe mostrarse como limitado; nunca como una comprobación satisfactoria.',size=10)

page('Verificación del sistema y resultados documentados')
para('La documentación de CloudOps registra una línea base real del 28 de octubre de 2026 sobre el mismo commit de SalesIA. Sirve como evidencia del funcionamiento de los flujos, no como medición del rendimiento académico ni como certificación del proyecto evaluado.',size=10)
table(['Flujo validado','Índice del motor','Cobertura','Hallazgos no informativos'],[
 ['Código ZIP','0/100','75 %','338'],['Repositorio GitHub','0/100','75 %','338'],['Cuenta AWS','18/100','82 %','52'],['Integral ZIP y AWS','5/100','79 %','390']],[5.5,3.4,3,4.2],10)
para('ZIP y GitHub produjeron los mismos conteos para el código evaluado. La integral combina un alcance distinto: su valor no significa que el código haya mejorado. Cobertura expresa lo que pudo comprobarse; el índice resume penalizaciones del motor y no es un porcentaje de protección.',size=10)
h('Comprobaciones registradas')
table(['Aspecto','Evidencia y alcance'],[
 ['Persistencia y entorno','PostgreSQL 17, migraciones y dependencias documentadas. Las consultas AWS dependen del rol y de la disponibilidad de cada servicio.'],
 ['Análisis','SBOM de 669 componentes y consulta OSV de 339 dependencias en la línea base. Se conservaron resultados parciales y fuentes omitidas.'],
 ['Interfaz y lógica','La entrega reciente registra 156 pruebas backend y 72 frontend, además de compilación, lint y revisión de navegación. Son pruebas documentadas; no todas equivalen a una validación integral de producción.'],
 ['Asesor IA','Generación real de propuestas con referencias válidas y revisión humana. El borrador no modifica el índice ni se incorpora al informe como aprobado.']],[4,12.1],10)
h('Límites y mejoras posteriores')
para('Ampliar permisos y validaciones de autorización antes de ofrecer aislamiento entre organizaciones; aumentar cobertura de lenguajes, secretos históricos y configuraciones calculadas; completar el inventario de servicios/regiones; y mejorar operación, escalabilidad y tamaño de la aplicación. Los servicios AWS opcionales pueden estar deshabilitados o entregar evidencia parcial.',size=10)
h('Fuentes del trabajo')
para('Repositorio CloudOps: README.md; docs/INSTALACION.md; docs/FASES_8_9.md; docs/REDISENO_EXPERIENCIA_SEGURIDAD.md; documentación de analizadores, cadena de suministro e infraestructura declarada; migraciones y componentes de los ocho módulos. Corte de revisión: 4 de noviembre de 2026.',size=9)

page('6. VALORAR',True)
para('Califica el impacto que representa la propuesta de solución ante la situación planteada en el caso práctico.',bold=True)
para('Autoevaluación propuesta para revisión y confirmación de los integrantes. No constituye una calificación del instructor.',size=10)
t=clone_table(10)
for i,v in enumerate(['3','7','5','2','17'],1):setcell(t.rows[i].cells[-1],v,11,True)
clean_table(t,[4.1,6.8,2.5,2.7],10)
setcell(t.rows[0].cells[2],'PUNTUACIÓN\nMÁXIMA',9,True)
h('Fundamento de la valoración')
para('Identificación del problema, 3/3: se explica la dispersión de información y la necesidad de relacionar operación, costos y seguridad. Relevancia, 7/8: los módulos cubren la propuesta de forma integrada; resta completar la evidencia visual y validar las preguntas del curso.',size=10)
para('Viabilidad técnica, 5/6: existe implementación, persistencia, pruebas y consultas reales; todavía se necesitan controles adicionales para una operación productiva a mayor escala. Normas, 2/3: se incorporan mínimo privilegio, protección de secretos, calidad, ergonomía y uso responsable de recursos; no se acredita una auditoría formal de cumplimiento.',size=10)
h('Impacto de la propuesta')
para('CloudOps permite conectar la revisión del entorno AWS con la planificación de servicios y presupuesto, y con la evaluación de código y configuración. El usuario puede pasar de una observación a su evidencia y preparar acciones concretas. El principal aporte es la organización y trazabilidad de la información para decidir; el ahorro económico y la reducción de incidentes requieren mediciones posteriores.',size=10)
para('Como aprendizaje, el trabajo integra desarrollo web, bases de datos, contenedores, redes, identidad cloud, análisis de software e IA con revisión humana. La siguiente etapa será fortalecer la operación y preparar la documentación técnica específica del sistema.',size=10)
para('Conformidad de integrantes: ________________________    Fecha: ______________',size=10)

# Restaurar la transición y contraportada sin alterar sus recursos.
for e in tail:d.element.body.append(e)
staging=ROOT/'authored.docx';d.save(staging)
editable={'word/document.xml','word/_rels/document.xml.rels','[Content_Types].xml'}
with ZipFile(SOURCE) as src, ZipFile(staging) as new, ZipFile(OUT,'w',ZIP_DEFLATED) as out:
 for n in src.namelist():out.writestr(n,new.read(n) if n in editable else src.read(n))
 for n in new.namelist():
  if n not in src.namelist():out.writestr(n,new.read(n))
with ZipFile(SOURCE) as a,ZipFile(OUT) as b:
 assert all(a.read(n)==b.read(n) for n in a.namelist() if n not in editable)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==sourcehash
print(OUT)
