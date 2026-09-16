document.addEventListener("DOMContentLoaded", () => {
    // Jalankan fungsi saat halaman kasir dimuat
    loadMembers();
    loadTransactions();

    // Event listener untuk form transaksi baru (jika ada)
    const formTransaksi = document.getElementById("form-transaksi");
    if (formTransaksi) {
        formTransaksi.addEventListener("submit", simpanTransaksi);
    }
});

// 1. Mengambil data Member dari server/backend
function loadMembers() {
    fetch('api/get_members.php') // Sesuaikan URL API/backend Anda
        .then(response => {
            if (!response.ok) throw new Error("Gagal mengambil data member");
            return response.json();
        })
        .then(data => {
            const selectMember = document.getElementById("select-member");
            if (!selectMember) return;

            selectMember.innerHTML = '<option value="">-- Pilih Member (Opsional) --</option>';
            data.forEach(member => {
                const option = document.createElement("option");
                option.value = member.id;
                option.textContent = `${member.nama} - ${member.telepon || ''}`;
                selectMember.appendChild(option);
            });
        })
        .catch(error => console.error("Error Member:", error));
}

// 2. Mengambil data Transaksi dari server/backend
function loadTransactions() {
    fetch('api/get_transactions.php') // Sesuaikan URL API/backend Anda
        .then(response => {
            if (!response.ok) throw new Error("Gagal mengambil data transaksi");
            return response.json();
        })
        .then(data => {
            const tableBody = document.getElementById("table-transaksi-body");
            if (!tableBody) return;

            tableBody.innerHTML = "";

            if (data.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Belum ada transaksi.</td></tr>`;
                return;
            }

            data.forEach((trx, index) => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${trx.kode_transaksi}</td>
                    <td>${trx.nama_member ? trx.nama_member : 'Non-Member'}</td>
                    <td>Rp ${Number(trx.total).toLocaleString('id-ID')}</td>
                    <td>${trx.tanggal}</td>
                `;
                tableBody.appendChild(row);
            });
        })
        .catch(error => console.error("Error Transaksi:", error));
}

// 3. Fungsi Tambahan: Mengirim Transaksi Baru ke Server
function simpanTransaksi(event) {
    event.preventDefault();

    const memberId = document.getElementById("select-member").value;
    const totalHarga = document.getElementById("total-harga").value;

    const dataPayload = {
        member_id: memberId,
        total: totalHarga
    };

    fetch('api/simpan_transaksi.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataPayload)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            alert("Transaksi berhasil disimpan!");
            loadTransactions(); // Refresh tabel transaksi
        } else {
            alert("Gagal menyimpan transaksi.");
        }
    })
    .catch(error => console.error("Error Simpan:", error));
}

