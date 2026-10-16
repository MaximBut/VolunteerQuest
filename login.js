const loginForm = document.getElementById("login");
const registerForm = document.getElementById("register");
const btn = document.getElementById("btn");

const logbtn = document.getElementById("log");
const regbtn = document.getElementById("reg");

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(loginForm);
  const data = Object.fromEntries(formData);

  const response = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const text = await response.text();

  if (response.redirected) {
    window.location.href = response.url;
  } else if (text.includes('Успішний вхід')) {
    Swal.fire({
      icon: 'success',
      title: 'Вхід успішний!',
      confirmButtonText: 'Гаразд',
      confirmButtonColor: '#8144fa'
    }).then(() => {
      window.location.href = '/home';
    });
  } else {
    Swal.fire({
      icon: 'error',
      title: 'Помилка!',
      text: text,
      confirmButtonText: 'Спробувати знову',
      confirmButtonColor: '#8144fa'
    });
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(registerForm);
  const data = Object.fromEntries(formData);

  const response = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const text = await response.text();

  if (text.includes('успішна')) {
    Swal.fire({
      icon: 'success',
      title: 'Успішно!',
      text: text,
      confirmButtonText: 'ОК',
      confirmButtonColor: '#05eb40'
    }).then(() => {
      setTimeout(showLogin, 100);
    });
  } else {
    Swal.fire({
      icon: 'error',
      title: 'Помилка!',
      text: text,
      confirmButtonText: 'Спробувати знову',
      confirmButtonColor: '#8144fa'
    });
  }
});

function showLogin() {
  loginForm.style.left = '50px';
  registerForm.style.left = '450px';
  btn.style.left = "0px";
}

function showRegister() {
  loginForm.style.left = '-400px';
  registerForm.style.left = '50px';
  btn.style.left = "115px";
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');

  if (input.type === "password") {
    input.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
}