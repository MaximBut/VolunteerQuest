const loginForm = document.getElementById("login");
const registerForm = document.getElementById("register");
const btn = document.getElementById("btn");

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(loginForm);
  const data = Object.fromEntries(formData);

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const textResult = await response.text();
    let result;
    
    try {
      result = JSON.parse(textResult);
    } catch {
      result = { success: false, message: textResult };
    }

    if (response.ok && result.success) {
      localStorage.setItem('userId', result.userId);
      localStorage.setItem('username', result.username);
      localStorage.setItem('userRole', result.role);
      localStorage.setItem('token', result.token || '');

      Swal.fire({
        icon: 'success',
        title: 'Вхід успішний!',
        confirmButtonText: 'Гаразд',
        confirmButtonColor: '#8144fa'
      }).then(() => {
        window.location.href = result.redirect;
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Помилка!',
        text: result.message || 'Невірний логін або пароль.',
        confirmButtonText: 'Спробувати знову',
        confirmButtonColor: '#8144fa'
      });
    }
  } catch (error) {
    console.error("Помилка:", error);
    Swal.fire({
      icon: 'error',
      title: 'Помилка мережі',
      text: 'Не вдалося підключитися до сервера.',
      confirmButtonText: 'ОК',
      confirmButtonColor: '#8144fa'
    });
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(registerForm);
  const data = Object.fromEntries(formData);

  try {
    const response = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const textResult = await response.text();

    if (response.ok) {
      Swal.fire({
        icon: 'success',
        title: 'Успішно!',
        text: 'Реєстрація пройшла успішно! Тепер увійдіть у систему.',
        confirmButtonText: 'ОК',
        confirmButtonColor: '#05eb40'
      }).then(() => {
        showLogin();
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Помилка!',
        text: textResult || 'Користувач з такими даними вже існує.',
        confirmButtonText: 'Спробувати знову',
        confirmButtonColor: '#8144fa'
      });
    }
  } catch (error) {
    console.error("Помилка:", error);
    Swal.fire({
      icon: 'error',
      title: 'Помилка мережі',
      text: 'Не вдалося звʼязатися з сервером.',
      confirmButtonText: 'ОК',
      confirmButtonColor: '#8144fa'
    });
  }
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