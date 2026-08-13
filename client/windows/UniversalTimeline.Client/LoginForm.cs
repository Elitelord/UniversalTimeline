using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using System.Runtime.InteropServices;

namespace UniversalTimeline.Client;

public class LoginForm : Form
{
    private readonly SupabaseAuth _auth;
    private readonly TextBox _emailBox;
    private readonly TextBox _passwordBox;
    private readonly RoundedButton _loginButton;
    private readonly Label _errorLabel;

    public const int WM_NCLBUTTONDOWN = 0xA1;
    public const int HT_CAPTION = 0x2;

    [DllImportAttribute("user32.dll")]
    public static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);
    [DllImportAttribute("user32.dll")]
    public static extern bool ReleaseCapture();

    public LoginForm(SupabaseAuth auth)
    {
        _auth = auth;

        // Form settings
        Text = "Universal Timeline";
        Width = 400;
        Height = 350;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(24, 24, 27); // zinc-900 for a solid dark theme
        ForeColor = Color.FromArgb(244, 244, 245); // zinc-100
        Font = new Font("Segoe UI", 9.5f);

        // Make the form itself rounded using region
        SetFormRegion();

        // Title bar area for dragging
        var titleBar = new Panel
        {
            Dock = DockStyle.Top,
            Height = 40,
            BackColor = Color.Transparent
        };
        titleBar.MouseDown += TitleBar_MouseDown;

        var closeButton = new Label
        {
            Text = "✕",
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            ForeColor = Color.FromArgb(161, 161, 170),
            Cursor = Cursors.Hand,
            Width = 40,
            Height = 40,
            TextAlign = ContentAlignment.MiddleCenter,
            Dock = DockStyle.Right
        };
        closeButton.Click += (s, e) => Close();
        closeButton.MouseEnter += (s, e) => closeButton.ForeColor = Color.White;
        closeButton.MouseLeave += (s, e) => closeButton.ForeColor = Color.FromArgb(161, 161, 170);
        titleBar.Controls.Add(closeButton);

        // Logo/Title area
        var titleLabel = new Label
        {
            Text = "Sign In",
            Font = new Font("Segoe UI Semibold", 20f),
            ForeColor = Color.White,
            Left = 32, Top = 50, Width = 350, Height = 40
        };

        var subtitleLabel = new Label
        {
            Text = "Connect your desktop to Universal Timeline",
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = Color.FromArgb(161, 161, 170), // zinc-400
            Left = 32, Top = 90, Width = 350, Height = 25
        };

        // Email Label & Input
        var emailLabel = new Label
        {
            Text = "Email",
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(212, 212, 216), // zinc-300
            Left = 32, Top = 130, Width = 336, Height = 18
        };

        _emailBox = new TextBox
        {
            BorderStyle = BorderStyle.None,
            BackColor = Color.FromArgb(39, 39, 42), // zinc-800
            ForeColor = Color.White,
            Width = 316,
            Top = 8,
            Left = 10,
            Font = new Font("Segoe UI", 10f)
        };
        var emailContainer = new RoundedPanel
        {
            Left = 32, Top = 150, Width = 336, Height = 36,
            BackColor = Color.FromArgb(39, 39, 42),
            BorderRadius = 6
        };
        emailContainer.Controls.Add(_emailBox);

        // Password Label & Input
        var passwordLabel = new Label
        {
            Text = "Password",
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(212, 212, 216), // zinc-300
            Left = 32, Top = 195, Width = 336, Height = 18
        };

        _passwordBox = new TextBox
        {
            BorderStyle = BorderStyle.None,
            BackColor = Color.FromArgb(39, 39, 42), // zinc-800
            ForeColor = Color.White,
            UseSystemPasswordChar = true,
            Width = 316,
            Top = 8,
            Left = 10,
            Font = new Font("Segoe UI", 10f)
        };
        var passwordContainer = new RoundedPanel
        {
            Left = 32, Top = 215, Width = 336, Height = 36,
            BackColor = Color.FromArgb(39, 39, 42),
            BorderRadius = 6
        };
        passwordContainer.Controls.Add(_passwordBox);

        // Error message label
        _errorLabel = new Label
        {
            Text = "",
            ForeColor = Color.FromArgb(248, 113, 113), // red-400
            Font = new Font("Segoe UI", 8.5f),
            Left = 32, Top = 255, Width = 336, Height = 20
        };

        // Login Button
        _loginButton = new RoundedButton
        {
            Text = "Sign In",
            Left = 32, Top = 280, Width = 336, Height = 40,
            BackColor = Color.FromArgb(244, 244, 245), // zinc-100
            ForeColor = Color.FromArgb(24, 24, 27), // zinc-900
            Cursor = Cursors.Hand,
            BorderRadius = 6
        };
        _loginButton.Click += OnLoginClick;

        Controls.AddRange(new Control[] { 
            titleBar,
            titleLabel, subtitleLabel, 
            emailLabel, emailContainer, 
            passwordLabel, passwordContainer, 
            _errorLabel, _loginButton 
        });

        AcceptButton = _loginButton;
        
        // Also allow clicking form background to drag
        MouseDown += TitleBar_MouseDown;
    }

    private void SetFormRegion()
    {
        var path = new GraphicsPath();
        int radius = 12;
        path.AddArc(0, 0, radius * 2, radius * 2, 180, 90);
        path.AddArc(Width - (radius * 2), 0, radius * 2, radius * 2, 270, 90);
        path.AddArc(Width - (radius * 2), Height - (radius * 2), radius * 2, radius * 2, 0, 90);
        path.AddArc(0, Height - (radius * 2), radius * 2, radius * 2, 90, 90);
        path.CloseFigure();
        Region = new Region(path);
    }

    private void TitleBar_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
        {
            ReleaseCapture();
            SendMessage(Handle, WM_NCLBUTTONDOWN, HT_CAPTION, 0);
        }
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

        var (success, error) = await _auth.LoginAsync(email, password);

        if (success)
        {
            DialogResult = DialogResult.OK;
            Close();
        }
        else
        {
            _errorLabel.Text = error;
            _loginButton.Enabled = true;
            _loginButton.Text = "Sign In";
        }
    }
}

public class RoundedPanel : Panel
{
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public int BorderRadius { get; set; } = 8;

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        var path = new GraphicsPath();
        path.AddArc(0, 0, BorderRadius * 2, BorderRadius * 2, 180, 90);
        path.AddArc(Width - (BorderRadius * 2), 0, BorderRadius * 2, BorderRadius * 2, 270, 90);
        path.AddArc(Width - (BorderRadius * 2), Height - (BorderRadius * 2), BorderRadius * 2, BorderRadius * 2, 0, 90);
        path.AddArc(0, Height - (BorderRadius * 2), BorderRadius * 2, BorderRadius * 2, 90, 90);
        path.CloseFigure();
        Region = new Region(path);
    }
}

public class RoundedButton : Button
{
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public int BorderRadius { get; set; } = 8;

    public RoundedButton()
    {
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        var path = new GraphicsPath();
        path.AddArc(0, 0, BorderRadius * 2, BorderRadius * 2, 180, 90);
        path.AddArc(Width - (BorderRadius * 2), 0, BorderRadius * 2, BorderRadius * 2, 270, 90);
        path.AddArc(Width - (BorderRadius * 2), Height - (BorderRadius * 2), BorderRadius * 2, BorderRadius * 2, 0, 90);
        path.AddArc(0, Height - (BorderRadius * 2), BorderRadius * 2, BorderRadius * 2, 90, 90);
        path.CloseFigure();
        Region = new Region(path);

        base.OnPaint(e);
    }
}
