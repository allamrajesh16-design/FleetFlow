import time
from datetime import datetime
from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Runs FleetFlow scheduled tasks (check_bus_schedules, expire_payment_qr, maintenance_alerts) "
        "every 5 minutes in an infinite loop. Press Ctrl+C to terminate."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--interval",
            type=int,
            default=300,
            help="Interval between runs in seconds (default: 300 seconds = 5 minutes).",
        )
        parser.add_argument(
            "--run-once",
            action="store_true",
            help="Run all scheduled jobs once and exit immediately (useful for testing or crons).",
        )

    def handle(self, *args, **options):
        interval = options["interval"]
        run_once = options["run_once"]

        self.stdout.write(
            self.style.NOTICE(
                f"FleetFlow scheduled job runner started. Loop interval: {interval} seconds ({interval / 60:.1f} mins). "
                "Press Ctrl+C to stop."
            )
        )

        iteration = 0
        last_purge_time = None
        while True:
            iteration += 1
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            jobs_run = []
            errors = []

            # 1. Bus schedule passenger check & auto-cancellation
            try:
                call_command("check_bus_schedules")
                jobs_run.append("check_bus_schedules")
            except Exception as e:
                errors.append(f"check_bus_schedules failed: {e}")

            # 2. Expire payment QR tokens
            try:
                call_command("expire_payment_qr")
                jobs_run.append("expire_payment_qr")
            except Exception as e:
                errors.append(f"expire_payment_qr failed: {e}")

            # 3. Vehicle maintenance upcoming alerts
            try:
                call_command("maintenance_alerts")
                jobs_run.append("maintenance_alerts")
            except Exception as e:
                errors.append(f"maintenance_alerts failed: {e}")

            # 4. Document & license expiry alerts
            try:
                call_command("document_alerts")
                jobs_run.append("document_alerts")
            except Exception as e:
                errors.append(f"document_alerts failed: {e}")

            # 5. Purge unverified registrations older than 24h (runs hourly or on run-once)
            if last_purge_time is None or (time.time() - last_purge_time) >= 3600 or run_once:
                try:
                    call_command("purge_unverified", apply=True)
                    jobs_run.append("purge_unverified")
                    last_purge_time = time.time()
                except Exception as e:
                    errors.append(f"purge_unverified failed: {e}")

            # 6. Notify unstarted trips whose scheduled date has passed
            try:
                call_command("notify_unstarted_trips")
                jobs_run.append("notify_unstarted_trips")
            except Exception as e:
                errors.append(f"notify_unstarted_trips failed: {e}")

            # Single summary line per run
            if errors:
                err_msg = "; ".join(errors)
                self.stdout.write(
                    self.style.WARNING(
                        f"[{now_str}] Iteration #{iteration}: Jobs run: {', '.join(jobs_run)}. Errors: {err_msg}. Next in {interval}s."
                    )
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"[{now_str}] Iteration #{iteration}: Completed: {', '.join(jobs_run)}. Next run in {interval}s."
                    )
                )

            if run_once:
                self.stdout.write(self.style.SUCCESS("Run-once completed successfully. Exiting."))
                break

            try:
                time.sleep(interval)
            except KeyboardInterrupt:
                self.stdout.write(self.style.NOTICE("\nScheduled job runner stopped by user (Ctrl+C)."))
                break
