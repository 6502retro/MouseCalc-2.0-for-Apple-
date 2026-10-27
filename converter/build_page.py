"""build_page.py SAMPLES_DIR OUT.html - inlines the libraries and the original
sample sheets (used as examples and as the file-header template)."""
import base64, json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); sdir, outp = sys.argv[1], sys.argv[2]
t=open(os.path.join(here, 'page_template.html')).read()
ex={}
for key,fn in [('SAMPLE.BILL','SAMPLE.BILL'),('SAMPLE.TAX','SAMPLE.TAX'),('SAMPLE.FORECAST','SAMPLE.FORECAST'),('TEMPLATES/BANK','TEMPLATES_BANK'),('TEMPLATES/LOOKUP','TEMPLATES_LOOKUP'),('TEMPLATES/POPULATION','TEMPLATES_POPULATION')]:
    ex[key]=base64.b64encode(open(os.path.join(sdir, fn),'rb').read()).decode()
for ph,fn in [('/*MCLIB*/','mclib.js'),('/*MCXLSX*/','mcxlsx.js'),('/*MCIMPORT*/','mcimport.js')]:
    t=t.replace(ph, open(os.path.join(here, fn)).read())
t=t.replace('/*EXAMPLES*/', json.dumps(ex))
open(outp,'w').write(t)
print(len(t))
