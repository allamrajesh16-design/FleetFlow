import os, sys, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from payments.models import Payment
from decimal import Decimal

cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'

if cmd == 'list':
    payments = list(Payment.objects.values('id', 'status', 'amount', 'transaction_reference', 'booking_id', 'trip_id'))
    for p in payments:
        if isinstance(p['amount'], Decimal):
            p['amount'] = float(p['amount'])
    print('JSON_START' + json.dumps(payments) + 'JSON_END')

elif cmd == 'update':
    pid = int(sys.argv[2])
    status = sys.argv[3]
    ref = sys.argv[4] if len(sys.argv) > 4 else None
    p = Payment.objects.filter(id=pid).first()
    if p:
        p.status = status
        if ref:
            p.transaction_reference = ref
        p.save()
        print('UPDATED', pid, status)

elif cmd == 'extract_pdf':
    pid = int(sys.argv[2])
    from pypdf import PdfReader
    import io
    from payments.models import Payment
    from payments.pdf import generate_receipt_pdf
    p = Payment.objects.filter(id=pid).first()
    if hasattr(p, 'receipt') and p.receipt:
        pdf_bytes = generate_receipt_pdf(p.receipt)
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = '\n'.join([page.extract_text() for page in reader.pages])
        print('PDF_TEXT_START' + text + 'PDF_TEXT_END')
    else:
        print('NO_PDF')
