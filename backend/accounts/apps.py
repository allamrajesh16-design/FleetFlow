import os
import sys
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'

    def ready(self):
        # Print active email mode when running server
        is_runserver = any('runserver' in arg for arg in sys.argv)
        if is_runserver:
            # Under autoreload, RUN_MAIN is set in the active child worker
            if os.environ.get('RUN_MAIN') != 'true' and '--noreload' not in sys.argv:
                return

            from django.conf import settings
            backend = getattr(settings, 'EMAIL_BACKEND', '')
            if 'console' in backend.lower():
                print("EMAIL MODE: console (emails are printed here and NOT delivered)")
            else:
                host = getattr(settings, 'EMAIL_HOST', 'localhost')
                print(f"EMAIL MODE: SMTP ({host})")
