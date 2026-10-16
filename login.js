const loginForm = document.getElementById("login");
const registerForm = document.getElementById("register");
const btn = document.getElementById("btn");

// Обробка ВХОДУ
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const usernameInput = loginForm.querySelector('input[name="username"]')?.value || loginForm.querySelector('input:nth-of-type(1)').value;
  const passwordInput = loginForm.querySelector('input[name="password"]')?.value || loginForm.querySelector('input:nth-of-type(2)').value;

  // Шукаємо збереженого користувача
  const savedUser = JSON.parse(localStorage.getItem('currentUser'));

  if (savedUser && savedUser.username === usernameInput && savedUser.password === passwordInput) {
    Swal.fire({
      icon: 'success',
      title: 'Вхід успішний!',
      confirmButtonText: 'Гаразд',
      confirmButtonColor: '#8144fa'
    }).then(() => {
      // Перенаправлення залежно від ролі або на головну
      if (savedUser.role === 'organizer') {
        window.location.href = 'organizer-dashboard.html';
      } else {
        window.location.href = 'volunteer-dashboard.html';
      }
    });
  } else {
    Swal.fire({
      icon: 'error',
      title: 'Помилка!',
      text: 'Невірний логін або пароль, або акаунт не створено.',
      confirmButtonText: 'Спробувати знову',
      confirmButtonColor: '#8144fa'
    });
  }
});

// Обробка РЕЄСТРАЦІЇ
registerForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const inputs = registerForm.querySelectorAll('input');
  const roleSelect = registerForm.querySelector('select');

  const userData = {
    username: inputs[0].value,
    email: inputs[1].value,
    password: inputs[2].value,
    role: roleSelect ? roleSelect.value : 'volunteer'
  };

  // Зберігаємо користувача в localStorage
  localStorage.setItem('currentUser', JSON.stringify(userData));

  Swal.fire({
    icon: 'success',
    title: 'Успішно!',
    text: 'Реєстрація пройшла успішно! Тепер увійдіть у систему.',
    confirmButtonText: 'ОК',
    confirmButtonColor: '#05eb40'
  }).then(() => {
    showLogin();
  });
});

function showLogin() {
  loginForm.style.left = '50px';
  registerForm.style.left = '450px';
  if (btn) btn.style.left = "0px";
}

function showRegister() {
  loginForm.style.left = '-400px';
  registerForm.style.left = '50px';
  if (btn) btn.style.left = "115px";
}

function togglePassword(inputId, btnEl) {
  const input = document.getElementById(inputId);
  const icon = btnEl.querySelector('i');

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