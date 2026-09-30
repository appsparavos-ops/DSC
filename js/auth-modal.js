/* DSC authentication gate for private roster/sanctions applications. */
(function () {
    'use strict';

    function modal() {
        let el = document.getElementById('dsc-login-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'dsc-login-modal';
        el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.78);padding:1rem;';
        el.innerHTML = `
          <div role="dialog" aria-modal="true" aria-labelledby="dsc-login-title" style="width:min(100%,26rem);background:#fff;border-radius:1rem;padding:1.5rem;box-shadow:0 25px 50px -12px rgba(0,0,0,.35);font-family:Inter,system-ui,sans-serif">
            <h2 id="dsc-login-title" style="margin:0 0 .35rem;color:#1e3a8a;font-size:1.35rem;font-weight:700">Acceso DSC</h2>
            <p style="margin:0 0 1.2rem;color:#64748b;font-size:.9rem">Ingresa con tu cuenta autorizada.</p>
            <form id="dsc-login-form" novalidate>
              <label for="dsc-login-email" style="display:block;margin:.6rem 0 .3rem;color:#334155;font-size:.8rem;font-weight:600">Correo electrónico</label>
              <input id="dsc-login-email" type="email" autocomplete="username" required style="box-sizing:border-box;width:100%;padding:.7rem;border:1px solid #cbd5e1;border-radius:.6rem">
              <label for="dsc-login-password" style="display:block;margin:.8rem 0 .3rem;color:#334155;font-size:.8rem;font-weight:600">Contraseña</label>
              <input id="dsc-login-password" type="password" autocomplete="current-password" required style="box-sizing:border-box;width:100%;padding:.7rem;border:1px solid #cbd5e1;border-radius:.6rem">
              <p id="dsc-login-error" role="alert" style="min-height:1.2rem;margin:.7rem 0;color:#dc2626;font-size:.8rem"></p>
              <button id="dsc-login-submit" type="submit" style="width:100%;padding:.75rem;border:0;border-radius:.6rem;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">Ingresar</button>
            </form>
          </div>`;
        document.body.appendChild(el);
        return el;
    }

    function deny(message) {
        const el = modal();
        el.querySelector('#dsc-login-error').textContent = message;
        el.querySelector('#dsc-login-form').style.display = 'none';
        el.querySelector('#dsc-login-title').textContent = 'Acceso no autorizado';
        el.querySelector('#dsc-login-submit')?.remove();
    }

    window.DSCAuth = {
        require: function ({ admin = false, onReady }) {
            const run = function (user) {
                // La cuenta compartida no es una sesión válida para estas aplicaciones.
                if (user && typeof GUEST_EMAIL !== 'undefined' && user.email === GUEST_EMAIL) {
                    firebase.auth().signOut();
                    return;
                }
                if (!user) {
                    const el = modal();
                    const form = el.querySelector('#dsc-login-form');
                    const email = el.querySelector('#dsc-login-email');
                    const password = el.querySelector('#dsc-login-password');
                    const error = el.querySelector('#dsc-login-error');
                    form.onsubmit = function (event) {
                        event.preventDefault();
                        error.textContent = '';
                        const button = el.querySelector('#dsc-login-submit');
                        button.disabled = true;
                        button.textContent = 'Ingresando...';
                        firebase.auth().signInWithEmailAndPassword(email.value.trim(), password.value)
                            .catch(function () {
                                error.textContent = 'No se pudo iniciar sesión. Verifica tus credenciales.';
                                button.disabled = false;
                                button.textContent = 'Ingresar';
                            });
                    };
                    email.focus();
                    return;
                }
                if (admin) {
                    firebase.database().ref('admins/' + user.uid).once('value').then(function (snapshot) {
                        if (!snapshot.exists()) {
                            deny('Esta aplicación requiere una cuenta de administrador.');
                            return;
                        }
                        document.getElementById('dsc-login-modal')?.remove();
                        onReady(user);
                    }).catch(function () {
                        firebase.auth().signOut();
                        deny('No se pudo verificar el permiso de administrador.');
                    });
                } else {
                    document.getElementById('dsc-login-modal')?.remove();
                    onReady(user);
                }
            };
            firebase.auth().onAuthStateChanged(run);
        }
    };
})();
