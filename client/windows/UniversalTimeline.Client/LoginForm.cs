using System.Drawing;
using System.Windows.Forms;

namespace UniversalTimeline.Client;

public class LoginForm : Form
{
    private readonly SupabaseAuth _auth;
    private readonly TextBox _emailBox;
    private readonly TextBox _passwordBox;
    private readonly Button _loginButton;
    private readonly Label _errorLabel;

    public LoginForm(SupabaseAuth auth)
    {
        _auth = auth;

        // Form settings
        Text = "Universal Timeline - Sign In";
        Width = 400;
        Height = 310;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        MaximizeBox = false;
        MinimizeBox = false;
        BackColor = Color.FromArgb(9, 9, 11); // zinc-950
        ForeColor = Color.FromArgb(244, 244, 245); // zinc-100
        Font = new Font("Segoe UI", 9.5f);

        // Logo/Title area
        var titleLabel = new Label
        {
            Text = "Universal Timeline",
            Font = new Font("Segoe UI Semibold", 16f),
            ForeColor = Color.White,
            Left = 24, Top = 20, Width = 350, Height = 35
        };

        var subtitleLabel = new Label
        {
            Text = "Sign in to sync your desktop activity",
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(161, 161, 170), // zinc-400
            Left = 24, Top = 55, Width = 350, Height = 20
        };

        // Email Label & Input
        var emailLabel = new Label
        {
            Text = "Email",
            Font = new Font("Segoe UI Semibold", 9f),
            ForeColor = Color.FromArgb(212, 212, 216), // zinc-300
            Left = 24, Top = 90, Width = 350, Height = 18
        };

        _emailBox = new TextBox
        {
            Left = 24, Top = 110, Width = 336,
            BackColor = Color.FromArgb(24, 24, 27), // zinc-900
            ForeColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };

        // Password Label & Input
        var passwordLabel = new Label
        {
            Text = "Password",
            Font = new Font("Segoe UI Semibold", 9f),
            ForeColor = Color.FromArgb(212, 212, 216), // zinc-300
            Left = 24, Top = 145, Width = 350, Height = 18
        };

        _passwordBox = new TextBox
        {
            Left = 24, Top = 165, Width = 336,
            UseSystemPasswordChar = true,
            BackColor = Color.FromArgb(24, 24, 27), // zinc-900
            ForeColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };

        // Error message label
        _errorLabel = new Label
        {
            Text = "",
            ForeColor = Color.FromArgb(248, 113, 113), // red-400
            Font = new Font("Segoe UI", 8.5f),
            Left = 24, Top = 195, Width = 336, Height = 20
        };

        // Login Button
        _loginButton = new Button
        {
            Text = "Sign In",
            Left = 24, Top = 218, Width = 336, Height = 36,
            BackColor = Color.FromArgb(244, 244, 245), // zinc-100
            ForeColor = Color.FromArgb(9, 9, 11), // zinc-950
            FlatStyle = FlatStyle.Flat,
            Cursor = Cursors.Hand
        };
        _loginButton.FlatAppearance.BorderSize = 0;
        _loginButton.Click += OnLoginClick;

        Controls.AddRange(new Control[] { 
            titleLabel, subtitleLabel, 
            emailLabel, _emailBox, 
            passwordLabel, _passwordBox, 
            _errorLabel, _loginButton 
        });

        AcceptButton = _loginButton;
    }

    private async void OnLoginClick(object? sender, EventArgs e)
    {
        var email = _emailBox.Text.Trim();
        var password = _passwordBox.Text;

        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
        {
            _errorLabel.Text = "Please fill in all fields.";
            return;
        }

        _loginButton.Enabled = false;
        _loginButton.Text = "Signing In...";
        _errorLabel.Text = "";

        bool success = await _auth.LoginAsync(email, password);

        if (success)
        {
            DialogResult = DialogResult.OK;
            Close();
        }
        else
        {
            _errorLabel.Text = "Invalid email or password.";
            _loginButton.Enabled = true;
            _loginButton.Text = "Sign In";
        }
    }
}
